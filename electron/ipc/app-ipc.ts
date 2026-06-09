/**
 * IPC handlers for app-level concerns: opening external URLs, version probe.
 */
import { app } from "electron";

import { openExternalSafe } from "../open-external";
import { ipcHandle } from "./ipc-handle";

export function registerAppIpc(): void {
    ipcHandle("app:openExternal", async (url: string) => {
        await openExternalSafe(url);
        return { success: true };
    });

    ipcHandle("app:getVersion", async () => {
        return { success: true, version: app.getVersion() };
    });
}
