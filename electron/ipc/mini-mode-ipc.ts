/**
 * IPC handlers for the mini-mode quick-prompt window (Phase 7).
 *
 * `miniMode:open`  — show the mini window (creating it on first use).
 * `miniMode:close` — hide the mini window.
 * `miniMode:sendQuick` — fire-and-forget prompt routed to the most-recent
 *   session, or to a brand-new session if none exists yet. Resolves with
 *   the chosen sessionId for telemetry / debugging.
 */
import { hideMiniWindow, showMiniWindow } from "../mini-mode-window";

import { ipcHandle } from "./ipc-handle";
import { getSessionManager } from "./sessions-ipc";

export function registerMiniModeIpc(): void {
    ipcHandle("miniMode:open", async () => {
        showMiniWindow();
        return { success: true };
    });

    ipcHandle("miniMode:close", async () => {
        hideMiniWindow();
        return { success: true };
    });

    ipcHandle("miniMode:sendQuick", async (prompt) => {
        const mgr = getSessionManager();
        const sessions = mgr.list();
        let target = sessions.length > 0 ? sessions[0] : undefined;
        if (!target) {
            target = await mgr.create();
        }
        // Don't await streaming — we want the mini window to close immediately.
        void mgr.send(target.sessionId, prompt);
        return { success: true, sessionId: target.sessionId };
    });
}
