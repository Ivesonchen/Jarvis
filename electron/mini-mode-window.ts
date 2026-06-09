/**
 * Mini-mode window lifecycle.
 *
 * A small, frameless, always-on-top BrowserWindow that loads the dedicated
 * `mini-mode.html` Vite entry. Created lazily on first show and hidden
 * (not destroyed) on close so the global hotkey can re-show it instantly.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BrowserWindow, screen } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RENDERER_DIST = path.join(__dirname, "..", "dist");
const PRELOAD_PATH = path.join(__dirname, "mini-mode-preload.cjs");

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let miniWindow: BrowserWindow | null = null;

export function getMiniWindow(): BrowserWindow | null {
    return miniWindow;
}

export function showMiniWindow(): void {
    if (!miniWindow || miniWindow.isDestroyed()) {
        miniWindow = createMiniWindow();
    }
    if (miniWindow.isVisible()) {
        miniWindow.focus();
    } else {
        miniWindow.show();
        miniWindow.focus();
    }
}

export function hideMiniWindow(): void {
    if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.hide();
    }
}

function createMiniWindow(): BrowserWindow {
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.workAreaSize;
    const w = 520;
    const h = 220;
    const win = new BrowserWindow({
        width: w,
        height: h,
        x: Math.round((width - w) / 2),
        y: Math.round(height * 0.25),
        frame: false,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        show: false,
        transparent: false,
        backgroundColor: "#0a0a0a",
        webPreferences: {
            preload: PRELOAD_PATH,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    if (VITE_DEV_SERVER_URL) {
        void win.loadURL(`${VITE_DEV_SERVER_URL}mini-mode.html`);
    } else {
        void win.loadFile(path.join(RENDERER_DIST, "mini-mode.html"));
    }

    win.on("blur", () => {
        if (!win.isDestroyed()) win.hide();
    });
    win.on("closed", () => {
        miniWindow = null;
    });

    return win;
}

export function destroyMiniWindow(): void {
    if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.destroy();
    }
    miniWindow = null;
}
