/**
 * SessionManager — owns the long-lived `CopilotSession` instances on top of
 * the SDK client. Bridges SDK events to the renderer over IPC.
 *
 * Responsibilities:
 *   - Open/create/resume sessions on demand (caches live `CopilotSession`s).
 *   - Subscribe to `assistant.message_delta` / `assistant.message` /
 *     `session.idle` / `session.error` events and emit corresponding IPC
 *     events with a `sessionId` discriminator.
 *   - Keep the local index (`session-store`) in sync (title, updatedAt).
 *   - Provide list/delete/rename plumbing on top of both the SDK and the
 *     local index.
 *
 * Phase 2 scope: simple — every session is granted `approveAll` for
 * permissions. The real permission engine lands in Phase 5.
 */
import {
    type CopilotClient,
    type CopilotSession,
    type PermissionHandler,
    type PermissionRequest,
    type PermissionRequestResult,
} from "@github/copilot-sdk";
import { app } from "electron";
import * as fs from "node:fs/promises";

import type { ChatAttachment, ChatMessage, SessionDetail, SessionSummary } from "@common/ipc-contract";
import { createLogger } from "@common/logger";

import { ApprovalBroker } from "../permissions/approval-broker";
import { appendAudit } from "../permissions/audit-log";
import { evaluate, toolKeyFor } from "../permissions/permission-policy";
import { getSettings, updateSettings } from "../settings/settings-store";
import * as store from "./session-store";

const log = createLogger("session-manager");

type StreamListener =
    | { type: "delta"; sessionId: string; messageId: string; deltaContent: string }
    | { type: "done"; sessionId: string; messageId: string; content: string }
    | { type: "reasoningDelta"; sessionId: string; reasoningId: string; deltaContent: string }
    | { type: "reasoningDone"; sessionId: string; reasoningId: string; content: string }
    | { type: "toolStart"; sessionId: string; toolCallId: string; toolName: string; description: string }
    | { type: "toolProgress"; sessionId: string; toolCallId: string; progressMessage: string }
    | { type: "toolComplete"; sessionId: string; toolCallId: string; success: boolean; errorMessage?: string }
    | { type: "turnStart"; sessionId: string }
    | { type: "turnEnd"; sessionId: string }
    | { type: "idle"; sessionId: string; aborted: boolean }
    | { type: "error"; sessionId: string; message: string; errorType?: string }
    | { type: "indexChanged"; sessionId?: string };

type ListenerFn = (ev: StreamListener) => void;

function defaultTitle(): string {
    return "New chat";
}

function titleFromPrompt(prompt: string): string {
    const flat = prompt.replace(/\s+/g, " ").trim();
    if (!flat) return defaultTitle();
    return flat.length > 60 ? flat.slice(0, 57) + "…" : flat;
}

export class SessionManager {
    private liveSessions = new Map<string, CopilotSession>();
    private subscriptions = new Map<string, Array<() => void>>();
    private streamingMessageIds = new Map<string, string>();
    private listeners = new Set<ListenerFn>();
    private defaultModel: string | undefined;
    /**
     * Per-session count of in-flight tool calls. Used by the idle fallback
     * timer to tell "turn ended, nothing else running" apart from
     * "turn ended, tool follow-up coming".
     */
    private runningToolCounts = new Map<string, number>();
    /**
     * Per-session timer that emits a synthetic `idle` event some time after
     * `assistant.turn_end` if the SDK doesn't fire `session.idle` itself.
     * Short responses on Copilot SDK 1.0 don't always emit `session.idle`,
     * which would leave the renderer's `isBusy` flag stuck on forever.
     */
    private idleFallbackTimers = new Map<string, ReturnType<typeof setTimeout>>();
    readonly broker = new ApprovalBroker();

    constructor(private readonly getClient: () => Promise<CopilotClient>) { }

    onEvent(listener: ListenerFn): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    setDefaultModel(modelId: string | undefined): void {
        this.defaultModel = modelId;
    }

    private emit(ev: StreamListener): void {
        for (const listener of this.listeners) {
            try {
                listener(ev);
            } catch (err) {
                log.warn("listener threw:", err);
            }
        }
    }

    // ───── public API surfaced via IPC ─────────────────────────────────────

    list(): SessionSummary[] {
        return store.listSessions();
    }

    async create(): Promise<SessionSummary> {
        const client = await this.getClient();
        const workingDirectory = app.getPath("home");
        const defaultModel = this.defaultModel;
        const session = await client.createSession({
            workingDirectory,
            streaming: true,
            onPermissionRequest: this.makePermissionHandler(),
            ...(defaultModel ? { model: defaultModel } : {}),
        });
        const summary: SessionSummary = {
            sessionId: session.sessionId,
            title: defaultTitle(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            workingDirectory,
            lastModel: defaultModel,
        };
        store.upsertSession(summary);
        this.registerSession(session);
        this.emit({ type: "indexChanged", sessionId: session.sessionId });
        log.info("created session", session.sessionId);
        return summary;
    }

    async open(sessionId: string): Promise<SessionDetail> {
        const session = await this.ensureSession(sessionId);
        const events = await session.getEvents();
        const messages = collapseEventsToMessages(events);

        let summary = store.getSession(sessionId);
        if (!summary) {
            // Session lives on the SDK side but not in our index — synthesize a row.
            summary = {
                sessionId,
                title: messages[0]?.content
                    ? titleFromPrompt(messages[0].content)
                    : defaultTitle(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                workingDirectory: app.getPath("home"),
            };
            store.upsertSession(summary);
            this.emit({ type: "indexChanged", sessionId });
        }
        return { summary, messages };
    }

    async delete(sessionId: string): Promise<void> {
        try {
            const client = await this.getClient();
            await client.deleteSession(sessionId);
        } catch (err) {
            log.warn("client.deleteSession failed (continuing with index cleanup):", err);
        }
        await this.detach(sessionId);
        store.deleteSession(sessionId);
        this.emit({ type: "indexChanged", sessionId });
    }

    rename(sessionId: string, title: string): void {
        const updated = store.touchSession(sessionId, { title });
        if (updated) this.emit({ type: "indexChanged", sessionId });
    }

    async setModel(sessionId: string, modelId: string): Promise<void> {
        const session = await this.ensureSession(sessionId);
        await session.setModel(modelId);
        const updated = store.touchSession(sessionId, { lastModel: modelId });
        if (updated) this.emit({ type: "indexChanged", sessionId });
    }

    async listModels(): Promise<Array<{ id: string; name: string; supportsVision: boolean; supportsReasoningEffort: boolean }>> {
        const client = await this.getClient();
        const models = await client.listModels();
        return models.map((m) => ({
            id: m.id,
            name: m.name,
            supportsVision: m.capabilities.supports.vision === true,
            supportsReasoningEffort: m.capabilities.supports.reasoningEffort === true,
        }));
    }

    async send(sessionId: string, prompt: string, attachments?: ChatAttachment[]): Promise<string> {
        const session = await this.ensureSession(sessionId);
        const summary = store.getSession(sessionId);
        // Auto-title from the first user prompt.
        if (summary && (summary.title === defaultTitle() || summary.title === "")) {
            const updated = store.touchSession(sessionId, { title: titleFromPrompt(prompt) });
            if (updated) this.emit({ type: "indexChanged", sessionId });
        } else {
            store.touchSession(sessionId, {});
            this.emit({ type: "indexChanged", sessionId });
        }

        let messageId: string;
        if (attachments && attachments.length > 0) {
            const blobs = await Promise.all(
                attachments.map(async (a) => ({
                    type: "blob" as const,
                    data: await readFileAsBase64(a.path),
                    mimeType: a.mimeType,
                    ...(a.displayName ? { displayName: a.displayName } : {}),
                })),
            );
            messageId = await session.send({ prompt, attachments: blobs });
        } else {
            messageId = await session.send(prompt);
        }
        this.streamingMessageIds.set(sessionId, messageId);
        return messageId;
    }

    async abort(sessionId: string): Promise<void> {
        const session = this.liveSessions.get(sessionId);
        if (!session) return;
        try {
            await session.abort();
        } catch (err) {
            log.warn("abort failed:", err);
        }
        // The SDK *should* fire `session.idle` with `aborted: true`, but it
        // doesn't always (especially when there's no in-flight turn to cancel).
        // Force-emit an idle so the renderer drops out of busy state. The real
        // idle, if it arrives later, is idempotent on the renderer side.
        this.cancelIdleFallback(sessionId);
        this.streamingMessageIds.delete(sessionId);
        this.runningToolCounts.delete(sessionId);
        this.emit({ type: "idle", sessionId, aborted: true });
    }

    /** Tear down all live SDK sessions (e.g. on app quit). */
    async shutdown(): Promise<void> {
        const tasks: Array<Promise<void>> = [];
        for (const sessionId of this.liveSessions.keys()) {
            tasks.push(this.detach(sessionId));
        }
        await Promise.allSettled(tasks);
    }

    // ───── internals ───────────────────────────────────────────────────────

    private async ensureSession(sessionId: string): Promise<CopilotSession> {
        const cached = this.liveSessions.get(sessionId);
        if (cached) return cached;

        const client = await this.getClient();
        const session = await client.resumeSession(sessionId, {
            onPermissionRequest: this.makePermissionHandler(),
            streaming: true,
        });
        this.registerSession(session);
        return session;
    }

    private registerSession(session: CopilotSession): void {
        const { sessionId } = session;
        this.liveSessions.set(sessionId, session);
        const unsubs: Array<() => void> = [];

        unsubs.push(
            session.on("assistant.message_delta", (e) => {
                this.emit({
                    type: "delta",
                    sessionId,
                    messageId: e.data.messageId,
                    deltaContent: e.data.deltaContent,
                });
            }),
        );

        unsubs.push(
            session.on("assistant.message", (e) => {
                this.emit({
                    type: "done",
                    sessionId,
                    messageId: e.data.messageId,
                    content: e.data.content,
                });
            }),
        );

        unsubs.push(
            session.on("assistant.reasoning_delta", (e) => {
                this.emit({
                    type: "reasoningDelta",
                    sessionId,
                    reasoningId: e.data.reasoningId,
                    deltaContent: e.data.deltaContent,
                });
            }),
        );

        unsubs.push(
            session.on("assistant.reasoning", (e) => {
                this.emit({
                    type: "reasoningDone",
                    sessionId,
                    reasoningId: e.data.reasoningId,
                    content: e.data.content,
                });
            }),
        );

        unsubs.push(
            session.on("assistant.turn_start", () => {
                // A new turn just started — cancel any pending fallback idle
                // emission so we don't mark the session idle in the middle of
                // a tool follow-up.
                this.cancelIdleFallback(sessionId);
                this.emit({ type: "turnStart", sessionId });
            }),
        );

        unsubs.push(
            session.on("assistant.turn_end", () => {
                this.emit({ type: "turnEnd", sessionId });
                this.scheduleIdleFallback(sessionId);
            }),
        );

        unsubs.push(
            session.on("tool.execution_start", (e) => {
                this.runningToolCounts.set(
                    sessionId,
                    (this.runningToolCounts.get(sessionId) ?? 0) + 1,
                );
                this.emit({
                    type: "toolStart",
                    sessionId,
                    toolCallId: e.data.toolCallId,
                    toolName: e.data.toolName,
                    description: describeToolCall(e.data),
                });
            }),
        );

        unsubs.push(
            session.on("tool.execution_progress", (e) => {
                this.emit({
                    type: "toolProgress",
                    sessionId,
                    toolCallId: e.data.toolCallId,
                    progressMessage: e.data.progressMessage,
                });
            }),
        );

        unsubs.push(
            session.on("tool.execution_complete", (e) => {
                const current = this.runningToolCounts.get(sessionId) ?? 0;
                if (current > 0) this.runningToolCounts.set(sessionId, current - 1);
                this.emit({
                    type: "toolComplete",
                    sessionId,
                    toolCallId: e.data.toolCallId,
                    success: e.data.success,
                    ...(e.data.error?.message ? { errorMessage: e.data.error.message } : {}),
                });
            }),
        );

        unsubs.push(
            session.on("session.idle", (e) => {
                this.cancelIdleFallback(sessionId);
                this.streamingMessageIds.delete(sessionId);
                this.runningToolCounts.delete(sessionId);
                this.emit({ type: "idle", sessionId, aborted: e.data.aborted === true });
            }),
        );

        unsubs.push(
            session.on("session.error", (e) => {
                this.emit({
                    type: "error",
                    sessionId,
                    message: e.data.message,
                    errorType: e.data.errorType,
                });
            }),
        );

        this.subscriptions.set(sessionId, unsubs);
    }

    private makePermissionHandler(): PermissionHandler {
        return async (req: PermissionRequest, { sessionId }): Promise<PermissionRequestResult> => {
            const settings = getSettings();
            const verdict = evaluate(req, settings);
            const summary = summarizeForAudit(req);

            if (verdict.decision === "allow") {
                appendAudit({
                    ts: new Date().toISOString(),
                    sessionId,
                    kind: req.kind,
                    decision: "auto-allow",
                    reason: verdict.reason,
                    summary,
                });
                return { kind: "approve-once" };
            }
            if (verdict.decision === "deny") {
                appendAudit({
                    ts: new Date().toISOString(),
                    sessionId,
                    kind: req.kind,
                    decision: "auto-deny",
                    reason: verdict.reason,
                    summary,
                });
                return { kind: "reject", feedback: verdict.reason };
            }

            // verdict === "prompt" — surface a card and wait for the user.
            const action = await this.broker.request(sessionId, req);
            const key = toolKeyFor(req);

            switch (action) {
                case "allow":
                    appendAudit({ ts: new Date().toISOString(), sessionId, kind: req.kind, decision: "allow", reason: "user", summary });
                    return { kind: "approve-once" };
                case "allow-session":
                    appendAudit({ ts: new Date().toISOString(), sessionId, kind: req.kind, decision: "allow", reason: "user (session)", summary });
                    return { kind: "approve-for-session" };
                case "allow-always": {
                    // Persist into settings so future runs auto-approve as well.
                    if (req.kind === "shell") {
                        const current = getSettings().permissions.alwaysAllowShell;
                        if (!current.includes(req.fullCommandText)) {
                            updateSettings({
                                permissions: {
                                    ...getSettings().permissions,
                                    alwaysAllowShell: [...current, req.fullCommandText],
                                },
                            });
                        }
                    } else {
                        const cur = getSettings().permissions.alwaysAllowTools;
                        if (cur[key] !== true) {
                            updateSettings({
                                permissions: {
                                    ...getSettings().permissions,
                                    alwaysAllowTools: { ...cur, [key]: true },
                                },
                            });
                        }
                    }
                    appendAudit({ ts: new Date().toISOString(), sessionId, kind: req.kind, decision: "allow", reason: "user (always)", summary });
                    return { kind: "approve-once" };
                }
                case "deny":
                default:
                    appendAudit({ ts: new Date().toISOString(), sessionId, kind: req.kind, decision: "deny", reason: "user", summary });
                    return { kind: "reject" };
            }
        };
    }

    private async detach(sessionId: string): Promise<void> {
        this.broker.cancelSession(sessionId);
        this.cancelIdleFallback(sessionId);
        this.runningToolCounts.delete(sessionId);
        const unsubs = this.subscriptions.get(sessionId);
        if (unsubs) {
            for (const off of unsubs) {
                try {
                    off();
                } catch {
                    /* ignore */
                }
            }
            this.subscriptions.delete(sessionId);
        }
        const session = this.liveSessions.get(sessionId);
        if (session) {
            try {
                await session.disconnect();
            } catch (err) {
                log.warn("session.disconnect failed:", err);
            }
            this.liveSessions.delete(sessionId);
        }
        this.streamingMessageIds.delete(sessionId);
    }

    /**
     * Schedule a fallback `idle` emission after `assistant.turn_end`. If no
     * tools are in flight and no new turn starts in ~750ms, we assume the
     * SDK won't fire `session.idle` on its own and emit it ourselves so the
     * renderer's busy state gets cleared.
     *
     * The SDK *should* always emit `session.idle`, but in practice it doesn't
     * for short replies in Copilot SDK 1.0 — without this fallback the chat
     * input stays disabled forever after the first message.
     */
    private scheduleIdleFallback(sessionId: string): void {
        // If a tool is still running, the SDK will (eventually) fire another
        // turn_start for the tool follow-up. Don't pre-empt that.
        if ((this.runningToolCounts.get(sessionId) ?? 0) > 0) return;
        // Reset any prior timer — only the latest turn_end wins.
        this.cancelIdleFallback(sessionId);
        const timer = setTimeout(() => {
            this.idleFallbackTimers.delete(sessionId);
            // Re-check under the timer in case a tool started after turn_end.
            if ((this.runningToolCounts.get(sessionId) ?? 0) > 0) return;
            log.info(`emitting fallback idle for session ${sessionId} (SDK did not)`);
            this.streamingMessageIds.delete(sessionId);
            this.runningToolCounts.delete(sessionId);
            this.emit({ type: "idle", sessionId, aborted: false });
        }, 750);
        this.idleFallbackTimers.set(sessionId, timer);
    }

    private cancelIdleFallback(sessionId: string): void {
        const existing = this.idleFallbackTimers.get(sessionId);
        if (existing) {
            clearTimeout(existing);
            this.idleFallbackTimers.delete(sessionId);
        }
    }
}

function summarizeForAudit(req: PermissionRequest): string {
    switch (req.kind) {
        case "shell":
            return req.fullCommandText.slice(0, 200);
        case "write":
        case "read":
            return req.kind === "write" ? req.fileName : req.path;
        case "mcp":
            return `${req.serverName}/${req.toolName}`;
        case "custom-tool":
            return req.toolName;
        case "url":
            return req.url;
        case "memory":
            return req.fact.slice(0, 200);
        case "hook":
            return req.toolName;
        default:
            return req.kind;
    }
}

// ───── tool call description ────────────────────────────────────────────

/**
 * Build a short, human-readable description for a `tool.execution_start`
 * payload. Used to populate the "Running tools…" timeline strip.
 */
function describeToolCall(data: {
    toolName: string;
    arguments?: { [k: string]: unknown | undefined };
    mcpServerName?: string;
    mcpToolName?: string;
}): string {
    const name = data.mcpServerName ? `${data.mcpServerName}/${data.mcpToolName ?? data.toolName}` : data.toolName;
    const args = data.arguments;
    if (!args) return name;
    // Common argument shapes from the bundled SDK tools.
    const path = pickStringArg(args, ["path", "filePath", "file", "uri"]);
    if (path) return `${name} ${path}`;
    const cmd = pickStringArg(args, ["command", "cmd", "shellCommand"]);
    if (cmd) return `${name} ${truncate(cmd, 80)}`;
    const url = pickStringArg(args, ["url"]);
    if (url) return `${name} ${url}`;
    const query = pickStringArg(args, ["query", "pattern"]);
    if (query) return `${name} ${truncate(query, 60)}`;
    return name;
}

function pickStringArg(
    args: { [k: string]: unknown | undefined },
    keys: ReadonlyArray<string>,
): string | undefined {
    for (const key of keys) {
        const v = args[key];
        if (typeof v === "string" && v.length > 0) return v;
    }
    return undefined;
}

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ───── event → message collapse ──────────────────────────────────────────

/**
 * Distill the SDK's per-event stream into the simple `ChatMessage[]` shape
 * the UI renders. We only surface user + final assistant messages; deltas,
 * tool calls, and lifecycle events are not displayed in Phase 2.
 */
function collapseEventsToMessages(events: ReadonlyArray<unknown>): ChatMessage[] {
    const out: ChatMessage[] = [];
    for (const raw of events) {
        if (!raw || typeof raw !== "object") continue;
        const ev = raw as {
            type?: string;
            id?: string;
            timestamp?: string;
            data?: Record<string, unknown>;
        };
        const data = ev.data ?? {};
        const ts = typeof ev.timestamp === "string" ? ev.timestamp : new Date().toISOString();

        if (ev.type === "user.message" && typeof data.content === "string") {
            out.push({
                id: ev.id ?? cryptoRandomId(),
                role: "user",
                content: data.content,
                timestamp: ts,
            });
        } else if (ev.type === "assistant.message" && typeof data.content === "string") {
            const msgId = typeof data.messageId === "string" ? data.messageId : (ev.id ?? cryptoRandomId());
            out.push({
                id: msgId,
                role: "assistant",
                content: data.content,
                timestamp: ts,
            });
        }
    }
    return out;
}

function cryptoRandomId(): string {
    // Lightweight unique id for synthesized rows; sessions/messages from the
    // SDK have their own UUIDs we prefer.
    return `m-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

async function readFileAsBase64(filePath: string): Promise<string> {
    const buf = await fs.readFile(filePath);
    return buf.toString("base64");
}
