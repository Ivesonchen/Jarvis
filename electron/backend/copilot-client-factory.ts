/**
 * Construct the GitHub Copilot SDK client.
 *
 * Adapted from CatClaw `electron/backend/copilot/client-factory.ts`.
 * Key bits we preserve:
 *   - Strip `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, GitHub tokens, and
 *     gitconfig env vars (#2486) before spawning.
 *   - Ensure PowerShell on PATH on Windows.
 *   - Use the TCP transport, not stdio — under Electron+Windows the SDK's
 *     default stdio transport sees EOF a few ms after spawn and exits with
 *     code 0 before the JSON-RPC handshake completes.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { CopilotClient, RuntimeConnection } from "@github/copilot-sdk";

import { createLogger } from "@common/logger";

import { getBundledCliPath } from "../cli-path";

const log = createLogger("client-factory");

const DEFAULT_WIN_SYSTEM_ROOT = "C:\\Windows";
const DEFAULT_PROGRAM_FILES = "C:\\Program Files";
const POWERSHELL_DIR_FNS: Array<(env: NodeJS.ProcessEnv) => string> = [
    (env) => path.join(env.ProgramFiles ?? DEFAULT_PROGRAM_FILES, "PowerShell", "7"),
    (env) =>
        path.join(env.SystemRoot ?? DEFAULT_WIN_SYSTEM_ROOT, "System32", "WindowsPowerShell", "v1.0"),
];

function ensurePowerShellInPath(env: NodeJS.ProcessEnv): void {
    const pathEnv = env.PATH ?? env.Path ?? "";
    const normalize = (d: string): string =>
        d.toLowerCase().replace(/\//g, "\\").replace(/\\$/, "");
    const normalizedDirs = pathEnv.split(";").map(normalize);
    const expected = POWERSHELL_DIR_FNS.map((fn) => normalize(fn(env)));
    if (expected.some((p) => normalizedDirs.includes(p))) return;

    const psDirs = POWERSHELL_DIR_FNS.map((fn) => fn(env)).filter(fs.existsSync);
    if (psDirs.length > 0) {
        const pathKey = env.PATH !== undefined ? "PATH" : "Path";
        env[pathKey] = psDirs.join(";") + (pathEnv ? ";" + pathEnv : "");
        log.info("added PowerShell to PATH:", psDirs);
    } else {
        log.warn("PowerShell not found on PATH; shell tools may misbehave");
    }
}

export async function createCopilotClient(workspaceDir: string): Promise<CopilotClient> {
    const cliPath = getBundledCliPath();
    log.info("spawning Copilot CLI from:", cliPath);

    const cleanEnv: NodeJS.ProcessEnv = { ...process.env };
    delete cleanEnv.ELECTRON_NO_ASAR;
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    delete cleanEnv.NODE_OPTIONS;
    // Stale GitHub tokens on PATH (e.g. from an unauthenticated `gh` install)
    // would otherwise leak into the CLI's env.
    delete cleanEnv.GH_TOKEN;
    delete cleanEnv.GITHUB_TOKEN;
    cleanEnv.GIT_PAGER = "";
    cleanEnv.GIT_TERMINAL_PROMPT = "0";
    delete cleanEnv.GIT_EXTERNAL_DIFF;
    delete cleanEnv.GIT_EDITOR;
    delete cleanEnv.GIT_ASKPASS;
    for (const key of Object.keys(cleanEnv)) {
        if (/^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+)$/i.test(key)) delete cleanEnv[key];
    }

    if (process.platform === "win32") {
        ensurePowerShellInPath(cleanEnv);
    }

    const client = new CopilotClient({
        logLevel: "info",
        workingDirectory: workspaceDir,
        env: cleanEnv,
        // TCP transport — see file header for why stdio is unusable under Electron.
        connection: RuntimeConnection.forTcp({ port: 0, path: cliPath }),
    });

    await client.start();
    log.info("Copilot SDK client started");
    return client;
}
