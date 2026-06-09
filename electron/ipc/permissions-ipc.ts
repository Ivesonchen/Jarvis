/**
 * IPC handlers for the permission card queue. The broker lives on the
 * `SessionManager` instance — we just forward list/respond + bridge its
 * change events to the renderer.
 */
import type { IpcEventMap } from "@common/ipc-contract";

import { ipcHandle } from "./ipc-handle";
import { getSessionManager } from "./sessions-ipc";

type Broadcast = <C extends keyof IpcEventMap>(channel: C, payload: IpcEventMap[C]) => void;

export function registerPermissionsIpc(broadcast: Broadcast): void {
    const broker = getSessionManager().broker;

    ipcHandle("permissions:list", async (sessionId) => {
        const cards = sessionId == null ? broker.listAll() : broker.listForSession(sessionId);
        return { success: true, cards };
    });

    ipcHandle("permissions:respond", async (requestId, action) => {
        const ok = broker.respond(requestId, action);
        if (!ok) return { success: false, error: "No pending permission with that requestId" };
        return { success: true };
    });

    broker.onChange((ev) => {
        broadcast("permissions:changed", { sessionId: ev.sessionId });
    });
}
