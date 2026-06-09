import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, globalShortcut } from "electron";

import type { IpcEventMap } from "@common/ipc-contract";
import { createLogger } from "@common/logger";

import { getBundledResource } from "./app-paths";
import { getAuthManager } from "./auth-manager";
import { registerShortcuts, unregisterAllShortcuts } from "./global-shortcuts";
import { registerAppIpc } from "./ipc/app-ipc";
import { registerAttachmentsIpc } from "./ipc/attachments-ipc";
import { registerAuthIpc } from "./ipc/auth-ipc";
import { registerMiniModeIpc } from "./ipc/mini-mode-ipc";
import { registerPermissionsIpc } from "./ipc/permissions-ipc";
import { registerScreenIpc } from "./ipc/screen-ipc";
import { getSessionManager, registerSessionsIpc } from "./ipc/sessions-ipc";
import { registerSettingsIpc } from "./ipc/settings-ipc";
import { registerWindowIpc } from "./ipc/window-ipc";
import { destroyMiniWindow, showMiniWindow } from "./mini-mode-window";
import { getSettings, onSettingsChanged } from "./settings/settings-store";
import { createTray, destroyTray } from "./tray";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vite-built renderer assets live in <root>/dist, the Electron bundle in <root>/dist-electron.
const RENDERER_DIST = path.join(__dirname, "..", "dist");
const PRELOAD_PATH = path.join(__dirname, "preload.cjs");

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

const log = createLogger("main");

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

function broadcast<C extends keyof IpcEventMap>(channel: C, payload: IpcEventMap[C]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: "Jarvis",
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    // Windows uses the .ico packed by electron-builder; on Linux we have to
    // hand it the PNG ourselves so the taskbar/Wayland surfaces pick it up.
    // macOS uses the .icns from the app bundle, so passing `icon` is a no-op
    // there but harmless.
    icon: getBundledResource(process.platform === "win32" ? "icon.ico" : "icon.png"),
    // Frameless on Windows/Linux — the renderer draws its own title bar.
    // On macOS, use `hiddenInset` so the native traffic lights still appear
    // (but flush under the renderer's title bar).
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const }
      : { frame: false }),
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(RENDERER_DIST, "index.html"));
    if (!app.isPackaged) {
      // When launched via `electron .` without a dev server (e.g. `pnpm run
      // electron:dev` which only does `vite build && electron .`) the
      // renderer is still loading the production bundle — but we want
      // DevTools so blank-screen failures are debuggable.
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  }

  // Close-to-tray: while `window.closeToTray` is on and the user is not
  // quitting, hide the window instead of destroying it. The tray's "Quit"
  // entry (and `before-quit` from Cmd-Q / Alt-F4-after-tray-quit) flips
  // `isQuitting` so this guard releases.
  mainWindow.on("close", (e) => {
    const { window } = getSettings();
    if (window.closeToTray && !isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showMain(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideMain(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
}

function toggleMain(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    showMain();
  }
}

app
  .whenReady()
  .then(() => {
    // macOS Dock icon (during dev, before electron-builder generates .icns).
    if (process.platform === "darwin" && app.dock) {
      try {
        app.dock.setIcon(getBundledResource("icon.png"));
      } catch (err) {
        log.warn("dock.setIcon failed:", err);
      }
    }

    registerAppIpc();
    registerAuthIpc(broadcast);
    registerSessionsIpc(broadcast);
    registerSettingsIpc(broadcast);
    registerPermissionsIpc(broadcast);
    registerAttachmentsIpc();
    registerScreenIpc();
    registerMiniModeIpc();
    registerWindowIpc(broadcast);

    // Pipe settings.defaultModel → SessionManager so new sessions pick it up.
    const initial = getSettings();
    const mgr = getSessionManager();
    mgr.setDefaultModel(initial.defaultModel);
    onSettingsChanged((s) => mgr.setDefaultModel(s.defaultModel));

    // Launch-on-startup (Windows + macOS — Linux ignored).
    const applyLoginItem = (launchOnStartup: boolean): void => {
      try {
        app.setLoginItemSettings({ openAtLogin: launchOnStartup });
      } catch (err) {
        log.warn("setLoginItemSettings failed:", err);
      }
    };
    applyLoginItem(initial.window.launchOnStartup);
    onSettingsChanged((s) => applyLoginItem(s.window.launchOnStartup));

    createWindow();

    // Tray + global hotkeys (Phase 7).
    const trayActions = {
      showMain,
      hideMain,
      newSession: () => {
        showMain();
        void mgr.create().catch((err: unknown) => log.warn("tray newSession failed:", err));
      },
      openSettings: () => {
        showMain();
        broadcast("settings:openRequested", {});
      },
      openMiniMode: () => {
        showMiniWindow();
      },
      signOut: () => {
        // Best-effort sign-out — the renderer auth bridge handles UI updates
        // automatically via the AuthManager event stream.
        void getAuthManager()
          .signOut()
          .catch((err: unknown) => log.warn("tray signOut failed:", err));
      },
      quit: () => {
        isQuitting = true;
        app.quit();
      },
    };
    createTray(trayActions);

    registerShortcuts({
      toggleMain,
      openMiniMode: () => showMiniWindow(),
    });
  })
  .catch((err: unknown) => {
    log.error("startup failed:", err);
  });

app.on("window-all-closed", () => {
  // With the tray installed, closing the main window doesn't quit — the
  // user must explicitly choose "Quit" from the tray. Honour the original
  // close-to-quit behaviour only when `closeToTray` is off.
  const { window } = getSettings();
  if (!window.closeToTray && process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  unregisterAllShortcuts();
  destroyTray();
  destroyMiniWindow();
  void getSessionManager().shutdown();
});

app.on("will-quit", () => {
  // Final safety unregister — `before-quit` already handles this but if a
  // hotkey crash short-circuits that path, Electron docs recommend a
  // belt-and-braces unregisterAll here.
  globalShortcut.unregisterAll();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

