/**
 * IPC handlers for the user-facing settings document. The store itself is
 * the single source of truth — these handlers just thin-wrap it. Anything
 * that needs to react to a settings change (permission policy, hotkey
 * registration, session-manager default model) should subscribe via
 * `onSettingsChanged` in `settings-store.ts`.
 */
import { shell } from "electron";

import type { IpcEventMap } from "@common/ipc-contract";

import {
    getSettings,
    getSettingsFilePath,
    onSettingsChanged,
    updateSettings,
} from "../settings/settings-store";
import { ipcHandle } from "./ipc-handle";

type Broadcast = <C extends keyof IpcEventMap>(channel: C, payload: IpcEventMap[C]) => void;

export function registerSettingsIpc(broadcast: Broadcast): void {
    ipcHandle("settings:get", async () => {
        const settings = getSettings();
        return { success: true, settings };
    });

    ipcHandle("settings:update", async (patch) => {
        const settings = updateSettings(patch);
        return { success: true, settings };
    });

    ipcHandle("settings:revealInExplorer", async () => {
        const file = getSettingsFilePath();
        shell.showItemInFolder(file);
        return { success: true };
    });

    onSettingsChanged((settings) => {
        broadcast("settings:changed", { settings });
    });
}
