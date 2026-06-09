/**
 * Auth manager — orchestrates GitHub device-flow login + SDK client lifecycle.
 *
 * Two related concerns under one roof for now (Phase 1):
 *   1. **Login flow** — spawn the bundled `copilot login` CLI subprocess
 *      directly, watch its stdout for a device code, and surface
 *      `{ userCode, verificationUri }` to the renderer. The subprocess keeps
 *      running while the user completes auth in their browser; we resolve
 *      `loginCompletion` when it exits cleanly.
 *   2. **SDK client** — lazy-init the long-lived `CopilotClient` used by
 *      every subsequent feature (auth status checks today, model listing &
 *      session creation in later phases).
 *
 * Adapted from CatClaw `electron/backend/copilot/provider.ts` (the `login`,
 * `signOut`, and `checkAuthStatus` methods specifically). Kept deliberately
 * thin — we'll split it up when sessions land.
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

import type { CopilotClient } from "@github/copilot-sdk";
import { app } from "electron";

import type { AuthStatus, DeviceFlowStart } from "@common/ipc-contract";
import { createLogger } from "@common/logger";

import { createCopilotClient } from "./backend/copilot-client-factory";
import { getBundledCliPath } from "./cli-path";

const execFileAsync = promisify(execFile);
const log = createLogger("auth-manager");

/** Where the Copilot CLI stores its own session metadata. */
const COPILOT_CONFIG_PATH = path.join(os.homedir(), ".copilot", "config.json");

/** Max stdout we'll buffer from the login subprocess before discarding. */
const MAX_OUTPUT_BYTES = 64 * 1024;

/** How long we wait for the CLI to emit a device code on stdout. */
const DEVICE_CODE_TIMEOUT_MS = 30_000;

/** How long we let the CLI subprocess linger after device code is shown. */
const PROCESS_LIFETIME_MS = 2 * 60_000;

type LoginEventListener = (event: LoginEvent) => void;
type LoginEvent =
    | { type: "succeeded"; username: string }
    | { type: "failed"; reason: string };

export class AuthManager {
    private client: CopilotClient | null = null;
    private initPromise: Promise<void> | null = null;
    private loginProc: ChildProcess | null = null;
    private listeners = new Set<LoginEventListener>();

    constructor(private readonly workspaceDir: string) { }

    // ───── public API ──────────────────────────────────────────────────────

    /** Subscribe to one-shot login outcomes (success/failure). */
    onLoginEvent(listener: LoginEventListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Lazy-init the SDK client. Idempotent; safe to call from any caller. */
    async ensureClient(): Promise<CopilotClient> {
        if (this.client) return this.client;
        if (this.initPromise) {
            await this.initPromise;
            if (!this.client) throw new Error("Copilot client init failed");
            return this.client;
        }
        this.initPromise = (async () => {
            this.client = await createCopilotClient(this.workspaceDir);
        })();
        try {
            await this.initPromise;
        } finally {
            this.initPromise = null;
        }
        if (!this.client) throw new Error("Copilot client init failed");
        return this.client;
    }

    /** Cheap auth probe — used by useAuth() React Query. */
    async checkAuth(): Promise<AuthStatus> {
        try {
            const client = await this.ensureClient();
            const status = await client.getAuthStatus();
            if (!status.isAuthenticated) return { authenticated: false };
            return {
                authenticated: true,
                username: status.login,
            };
        } catch (err) {
            log.warn("checkAuth failed:", err);
            return { authenticated: false };
        }
    }

    /**
     * Kick off device-flow login. Returns once the CLI prints a device code;
     * the subprocess keeps running until the user finishes auth in the browser
     * (or we time out / cancel). Background-emits "auth:loginSucceeded" or
     * "auth:loginFailed" once the subprocess exits.
     */
    async startDeviceFlow(): Promise<DeviceFlowStart> {
        this.cancelDeviceFlow();
        const cliPath = getBundledCliPath();

        return new Promise<DeviceFlowStart>((resolve, reject) => {
            // Note: on Windows we set windowsHide so the CLI doesn't flash a console.
            const proc = spawn(cliPath, ["login"], {
                stdio: ["pipe", "pipe", "pipe"],
                windowsHide: true,
            });
            this.loginProc = proc;

            let output = "";
            let outputBytes = 0;
            let codeResolved = false;
            let timer: NodeJS.Timeout | undefined;

            const fail = (reason: string): void => {
                try {
                    proc.kill();
                } catch {
                    /* already gone */
                }
                if (this.loginProc === proc) this.loginProc = null;
                if (timer) clearTimeout(timer);
                if (!codeResolved) {
                    reject(new Error(reason));
                } else {
                    this.emit({ type: "failed", reason });
                }
            };

            timer = setTimeout(() => {
                fail(
                    `copilot login: no device code within ${DEVICE_CODE_TIMEOUT_MS / 1000}s. ` +
                    `Output so far: ${output.slice(0, 500) || "(empty)"}`,
                );
            }, DEVICE_CODE_TIMEOUT_MS);

            const onData = (data: Buffer): void => {
                const remaining = MAX_OUTPUT_BYTES - outputBytes;
                if (remaining <= 0) return;
                const chunk = data.length > remaining ? data.subarray(0, remaining) : data;
                outputBytes += chunk.length;
                const text = chunk.toString();
                output += text;
                log.info("login output:", text.trim());

                if (!codeResolved) {
                    const codeMatch = output.match(/code[:\s]+([A-Z0-9]{4}-[A-Z0-9]{4})/i);
                    const uriMatch = output.match(/(https:\/\/github\.com\/login\/device)/i);
                    if (codeMatch) {
                        codeResolved = true;
                        if (timer) clearTimeout(timer);
                        // Generous post-code timer so the subprocess doesn't linger
                        // forever if the user abandons the browser flow.
                        timer = setTimeout(() => {
                            fail("copilot login timed out after 2 min");
                        }, PROCESS_LIFETIME_MS);
                        resolve({
                            userCode: codeMatch[1],
                            verificationUri: uriMatch?.[1] ?? "https://github.com/login/device",
                        });
                    }
                }
            };

            proc.stdout?.on("data", onData);
            proc.stderr?.on("data", onData);

            proc.on("error", (err) => {
                log.error("login subprocess error:", err);
                fail(err.message);
            });

            proc.on("close", async (code) => {
                if (timer) clearTimeout(timer);
                if (this.loginProc === proc) this.loginProc = null;

                if (!codeResolved) {
                    // Process exited before we saw a device code. Code 0 = "already
                    // logged in" (the CLI prints a status line and exits cleanly).
                    if (code === 0) {
                        const status: AuthStatus = await this.checkAuth().catch(() => ({
                            authenticated: false,
                        }));
                        if (status.authenticated && status.username) {
                            this.emit({ type: "succeeded", username: status.username });
                            // The Promise resolves with a synthetic "already" sentinel —
                            // renderer treats userCode = "" as "no code, just refetch".
                            resolve({ userCode: "", verificationUri: "" });
                        } else {
                            reject(new Error("copilot login exited 0 but no auth status"));
                        }
                    } else {
                        reject(new Error(`copilot login exited ${code}: ${output.slice(0, 500)}`));
                    }
                    return;
                }

                if (code !== 0) {
                    this.emit({ type: "failed", reason: `copilot login exited ${code}` });
                    return;
                }

                // Code 0 after device code → success. Restart the SDK client so
                // subsequent calls pick up the new creds.
                await this.resetClient();
                const status: AuthStatus = await this.checkAuth().catch(() => ({
                    authenticated: false,
                }));
                if (status.authenticated && status.username) {
                    this.emit({ type: "succeeded", username: status.username });
                } else {
                    this.emit({ type: "failed", reason: "Login completed but auth check still negative" });
                }
            });
        });
    }

    cancelDeviceFlow(): void {
        if (this.loginProc) {
            log.info("cancelling in-flight login");
            try {
                this.loginProc.kill();
            } catch {
                /* already dead */
            }
            this.loginProc = null;
        }
    }

    async signOut(): Promise<void> {
        log.info("signing out");
        this.cancelDeviceFlow();
        await this.resetClient();

        // Wipe the CLI's own state file.
        try {
            if (fs.existsSync(COPILOT_CONFIG_PATH)) {
                const raw = fs.readFileSync(COPILOT_CONFIG_PATH, "utf-8");
                // The CLI's config.json is JSON-with-comments — strip block & line comments.
                const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
                try {
                    const parsed = JSON.parse(stripped) as Record<string, unknown>;
                    delete parsed.logged_in_users;
                    delete parsed.last_logged_in_user;
                    fs.writeFileSync(COPILOT_CONFIG_PATH, JSON.stringify(parsed, null, 2), {
                        encoding: "utf-8",
                        mode: 0o600,
                    });
                } catch {
                    log.warn("could not parse ~/.copilot/config.json; leaving it untouched");
                }
            }
        } catch (err) {
            log.warn("failed to clear ~/.copilot/config.json:", err);
        }

        // Best-effort credential cleanup. The Copilot CLI stores its OAuth
        // token in the OS credential store under "copilot-cli". On Windows it
        // lives as `LegacyGeneric:target=copilot-cli` so a plain
        // `cmdkey /delete:copilot-cli` returns "Element not found" — we
        // enumerate and substring-match as a fallback. If we skip this the
        // next `ensureClient()` re-reads the token and reports the user as
        // still signed in. (Mirrors CatClaw `electron/backend/copilot/provider.ts`.)
        const service = "copilot-cli";
        try {
            if (process.platform === "darwin") {
                await execFileAsync("security", ["delete-generic-password", "-s", service], {
                    windowsHide: true,
                    timeout: 5000,
                });
            } else if (process.platform === "win32") {
                try {
                    await execFileAsync("cmdkey", [`/delete:${service}`], {
                        windowsHide: true,
                        timeout: 5000,
                    });
                } catch {
                    // Fallback: enumerate stored targets and delete by substring match.
                    try {
                        const { stdout } = await execFileAsync("cmdkey", ["/list"], {
                            windowsHide: true,
                            timeout: 5000,
                        });
                        const targets = stdout
                            .split(/\r?\n/)
                            .map((l) => l.match(/Target:\s*(.*)/)?.[1]?.trim())
                            .filter(
                                (t): t is string =>
                                    !!t && t.toLowerCase().includes(service.toLowerCase()),
                            );
                        for (const target of targets) {
                            try {
                                await execFileAsync("cmdkey", [`/delete:${target}`], {
                                    windowsHide: true,
                                    timeout: 5000,
                                });
                                log.info("deleted Windows credential:", target);
                            } catch {
                                /* non-fatal — keep going */
                            }
                        }
                    } catch {
                        /* non-fatal */
                    }
                }
            }
        } catch {
            /* non-fatal */
        }
    }

    // ───── internals ───────────────────────────────────────────────────────

    private async resetClient(): Promise<void> {
        if (!this.client) return;
        try {
            // SDK provides stop(); fall back to no-op if unavailable.
            const maybeStop = (this.client as unknown as { stop?: () => Promise<void> }).stop;
            if (typeof maybeStop === "function") {
                await maybeStop.call(this.client);
            }
        } catch (err) {
            log.warn("client.stop failed:", err);
        }
        this.client = null;
        this.initPromise = null;
    }

    private emit(ev: LoginEvent): void {
        for (const listener of this.listeners) {
            try {
                listener(ev);
            } catch (err) {
                log.warn("login listener threw:", err);
            }
        }
    }
}

let singleton: AuthManager | null = null;

export function getAuthManager(): AuthManager {
    if (!singleton) {
        // Default workspace dir is the user's home — overridable later when
        // we add a workspace picker.
        singleton = new AuthManager(app.getPath("home"));
    }
    return singleton;
}
