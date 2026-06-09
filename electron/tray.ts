/**
 * System tray integration.
 *
 * On both macOS and Windows we mount a single tray icon with a context menu
 * for quick access to common actions. The renderer signals show/hide
 * preferences via the settings document — Quit toggles the `isQuiting`
 * flag so the BrowserWindow `close` interceptor in `main.ts` knows to let
 * the app actually exit.
 */
import { app, Menu, nativeImage, Tray } from "electron";

import { createLogger } from "@common/logger";

import { getBundledResource } from "./app-paths";

const log = createLogger("tray");

let tray: Tray | null = null;

/**
 * 16×16 grey "J" PNG, embedded as a data URL. Used only as a last-resort
 * fallback if the rasterized `resources/tray.png` is missing — keeps the
 * tray from disappearing entirely during local dev before `pnpm icons` has
 * been run.
 */
const PLACEHOLDER_ICON_DATA_URL =
    "data:image/png;base64," +
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAaElEQVQ4jWNgGAWjYBSMglEwCkbBKBgFo2AUDC" +
    "nAyMDAwMDw//9/BgYGBobv378zMjIyMjAwMDAwMDD8//+fkZGRgYGBgYGBgYHh//" +
    "//DAwMDAwMDAwMDAwMDP///2dgZGBgYGBgGAVDCwAA1eMNCBfCRgkAAAAASUVORK5CYII=";

export interface TrayActions {
    showMain: () => void;
    hideMain: () => void;
    newSession: () => void;
    openSettings: () => void;
    openMiniMode: () => void;
    signOut: () => void;
    quit: () => void;
}

function loadTrayIcon(): Electron.NativeImage {
    const branded = tryLoadBrandedIcon();
    if (branded) return branded;
    log.warn("falling back to placeholder tray icon — run `pnpm icons` to generate resources/tray.png");
    return nativeImage.createFromDataURL(PLACEHOLDER_ICON_DATA_URL);
}

export function createTray(actions: TrayActions): Tray | null {
    if (tray) return tray;
    try {
        tray = new Tray(loadTrayIcon());
        tray.setToolTip("Jarvis");
        refreshMenu(actions);
        tray.on("click", () => actions.showMain());
        return tray;
    } catch (err) {
        log.error("failed to create tray:", err);
        return null;
    }
}

export function refreshMenu(actions: TrayActions): void {
    if (!tray) return;
    const menu = Menu.buildFromTemplate([
        { label: "Show Jarvis", click: () => actions.showMain() },
        { label: "Hide Jarvis", click: () => actions.hideMain() },
        { type: "separator" },
        { label: "New chat", click: () => actions.newSession() },
        { label: "Mini mode…", accelerator: "CmdOrCtrl+Shift+Space", click: () => actions.openMiniMode() },
        { type: "separator" },
        { label: "Settings…", click: () => actions.openSettings() },
        { label: "Sign out", click: () => actions.signOut() },
        { type: "separator" },
        { label: `Version ${app.getVersion()}`, enabled: false },
        { label: "Quit Jarvis", click: () => actions.quit() },
    ]);
    tray.setContextMenu(menu);
}

export function destroyTray(): void {
    if (tray) {
        tray.destroy();
        tray = null;
    }
}

/**
 * Load the branded tray bitmap from `resources/tray.png`. macOS will pick up
 * `tray@2x.png` automatically when the path ends in `tray.png` and a sibling
 * `@2x` exists.
 */
export function tryLoadBrandedIcon(): Electron.NativeImage | null {
    const candidate = getBundledResource("tray.png");
    const img = nativeImage.createFromPath(candidate);
    return img.isEmpty() ? null : img;
}
