/**
 * IPC handlers for the custom title bar's window controls (minimize, toggle
 * maximize, close). The frameless window has no native chrome — these are the
 * renderer's only way to trigger window-level actions.
 *
 * Also emits `window:maximizedChanged` whenever the BrowserWindow flips
 * between maximized and restored, so the title bar's restore/maximize icon
 * can update if the user double-clicks the OS resize handle.
 */
import { app, BrowserWindow } from "electron";

import type { IpcEventMap } from "@common/ipc-contract";

import { ipcHandle } from "./ipc-handle";

type Broadcast = <C extends keyof IpcEventMap>(channel: C, payload: IpcEventMap[C]) => void;

function focused(): BrowserWindow | null {
    return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

export function registerWindowIpc(broadcast: Broadcast): void {
    ipcHandle("window:minimize", () => {
        focused()?.minimize();
        return { success: true };
    });

    ipcHandle("window:toggleMaximize", () => {
        const win = focused();
        if (!win) return { success: true, isMaximized: false };
        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }
        return { success: true, isMaximized: win.isMaximized() };
    });

    ipcHandle("window:close", () => {
        focused()?.close();
        return { success: true };
    });

    ipcHandle("window:isMaximized", () => {
        return { success: true, isMaximized: focused()?.isMaximized() ?? false };
    });

    // Wire maximize/unmaximize events on every existing + future window so the
    // renderer's title bar stays in sync if the user double-clicks the resize
    // handle or hits the OS-native maximize shortcut.
    const attach = (win: BrowserWindow): void => {
        const emit = (): void =>
            broadcast("window:maximizedChanged", { isMaximized: win.isMaximized() });
        win.on("maximize", emit);
        win.on("unmaximize", emit);
    };
    for (const w of BrowserWindow.getAllWindows()) attach(w);
    // Electron emits "browser-window-created" on app for new windows.
    app.on("browser-window-created", (_e, win) => attach(win));
}
