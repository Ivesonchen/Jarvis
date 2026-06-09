/**
 * IPC handlers for the sessions list + chat streaming (Phase 2).
 *
 * `registerSessionsIpc(broadcast)` wires invoke handlers for the
 * `sessions:*` and `chat:*` channels, and subscribes to `SessionManager`
 * events to broadcast streaming updates to the renderer.
 */
import type { IpcEventMap } from "@common/ipc-contract";

import { getAuthManager } from "../auth-manager";
import { SessionManager } from "../sessions/session-manager";

import { ipcHandle } from "./ipc-handle";

type Broadcast = <C extends keyof IpcEventMap>(channel: C, payload: IpcEventMap[C]) => void;

let manager: SessionManager | undefined;

/** Lazily build the session manager; exposed for tests / shutdown hooks. */
export function getSessionManager(): SessionManager {
    if (!manager) {
        const auth = getAuthManager();
        manager = new SessionManager(() => auth.ensureClient());
    }
    return manager;
}

export function registerSessionsIpc(broadcast: Broadcast): void {
    const mgr = getSessionManager();

    // ── sessions:* ──
    ipcHandle("sessions:list", async () => {
        const sessions = mgr.list();
        return { success: true, sessions };
    });

    ipcHandle("sessions:create", async () => {
        const session = await mgr.create();
        return { success: true, session };
    });

    ipcHandle("sessions:open", async (sessionId) => {
        const detail = await mgr.open(sessionId);
        return { success: true, detail };
    });

    ipcHandle("sessions:delete", async (sessionId) => {
        await mgr.delete(sessionId);
        return { success: true };
    });

    ipcHandle("sessions:rename", async (sessionId, title) => {
        mgr.rename(sessionId, title);
        return { success: true };
    });

    ipcHandle("sessions:setModel", async (sessionId, modelId) => {
        await mgr.setModel(sessionId, modelId);
        return { success: true };
    });

    ipcHandle("models:list", async () => {
        const models = await mgr.listModels();
        return { success: true, models };
    });

    // ── chat:* ──
    ipcHandle("chat:send", async (sessionId, prompt, attachments) => {
        const messageId = await mgr.send(sessionId, prompt, attachments);
        return { success: true, messageId };
    });

    ipcHandle("chat:abort", async (sessionId) => {
        await mgr.abort(sessionId);
        return { success: true };
    });

    // ── event bridge ──
    mgr.onEvent((ev) => {
        switch (ev.type) {
            case "delta":
                broadcast("chat:streamDelta", {
                    sessionId: ev.sessionId,
                    messageId: ev.messageId,
                    deltaContent: ev.deltaContent,
                });
                break;
            case "done":
                broadcast("chat:streamDone", {
                    sessionId: ev.sessionId,
                    messageId: ev.messageId,
                    content: ev.content,
                });
                break;
            case "reasoningDelta":
                broadcast("chat:reasoningDelta", {
                    sessionId: ev.sessionId,
                    reasoningId: ev.reasoningId,
                    deltaContent: ev.deltaContent,
                });
                break;
            case "reasoningDone":
                broadcast("chat:reasoningDone", {
                    sessionId: ev.sessionId,
                    reasoningId: ev.reasoningId,
                    content: ev.content,
                });
                break;
            case "toolStart":
                broadcast("chat:toolStart", {
                    sessionId: ev.sessionId,
                    toolCallId: ev.toolCallId,
                    toolName: ev.toolName,
                    description: ev.description,
                });
                break;
            case "toolProgress":
                broadcast("chat:toolProgress", {
                    sessionId: ev.sessionId,
                    toolCallId: ev.toolCallId,
                    progressMessage: ev.progressMessage,
                });
                break;
            case "toolComplete":
                broadcast("chat:toolComplete", {
                    sessionId: ev.sessionId,
                    toolCallId: ev.toolCallId,
                    success: ev.success,
                    ...(ev.errorMessage ? { errorMessage: ev.errorMessage } : {}),
                });
                break;
            case "turnStart":
                broadcast("chat:turnStart", { sessionId: ev.sessionId });
                break;
            case "turnEnd":
                broadcast("chat:turnEnd", { sessionId: ev.sessionId });
                break;
            case "idle":
                broadcast("chat:idle", { sessionId: ev.sessionId, aborted: ev.aborted });
                break;
            case "error":
                broadcast("chat:error", {
                    sessionId: ev.sessionId,
                    message: ev.message,
                    errorType: ev.errorType,
                });
                break;
            case "indexChanged":
                broadcast("sessions:changed", { sessionId: ev.sessionId });
                break;
        }
    });
}
