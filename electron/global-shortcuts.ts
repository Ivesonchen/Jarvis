/**
 * Global-shortcut registration.
 *
 * Reads the user-configured hotkeys from settings and (re-)registers them
 * with Electron. Settings changes trigger an unregister/register cycle so
 * editing the field is reflected immediately.
 *
 * Hotkey strings follow Electron's accelerator format
 * (e.g. "CommandOrControl+Shift+Space"). Empty strings are treated as
 * "unbound" and silently skipped.
 */
import { globalShortcut } from "electron";

import { createLogger } from "@common/logger";

import { getSettings, onSettingsChanged } from "./settings/settings-store";

const log = createLogger("shortcuts");

export interface ShortcutActions {
    toggleMain: () => void;
    openMiniMode: () => void;
}

let bound: {
    showHide?: string;
    miniMode?: string;
} = {};
let listenerDetach: (() => void) | null = null;

function safeRegister(accel: string, fn: () => void): boolean {
    if (!accel) return false;
    try {
        if (globalShortcut.isRegistered(accel)) {
            log.warn(`accelerator ${accel} already registered; skipping`);
            return false;
        }
        const ok = globalShortcut.register(accel, fn);
        if (!ok) log.warn(`OS rejected accelerator ${accel}`);
        return ok;
    } catch (err) {
        log.warn(`failed to register ${accel}:`, err);
        return false;
    }
}

function unregister(accel: string | undefined): void {
    if (!accel) return;
    try {
        if (globalShortcut.isRegistered(accel)) globalShortcut.unregister(accel);
    } catch (err) {
        log.warn(`failed to unregister ${accel}:`, err);
    }
}

export function registerShortcuts(actions: ShortcutActions): void {
    const apply = (): void => {
        const { hotkeys } = getSettings();

        // Diff: only re-bind the accelerators that actually changed.
        if (bound.showHide !== hotkeys.showHide) {
            unregister(bound.showHide);
            if (hotkeys.showHide) safeRegister(hotkeys.showHide, actions.toggleMain);
            bound.showHide = hotkeys.showHide;
        }
        if (bound.miniMode !== hotkeys.miniMode) {
            unregister(bound.miniMode);
            if (hotkeys.miniMode) safeRegister(hotkeys.miniMode, actions.openMiniMode);
            bound.miniMode = hotkeys.miniMode;
        }
    };

    apply();
    if (listenerDetach) listenerDetach();
    listenerDetach = onSettingsChanged(() => apply());
}

export function unregisterAllShortcuts(): void {
    globalShortcut.unregisterAll();
    bound = {};
    if (listenerDetach) {
        listenerDetach();
        listenerDetach = null;
    }
}
