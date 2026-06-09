# Javis

Desktop GitHub Copilot chat client — Electron + React 19 + TypeScript + Vite, wrapping the [`@github/copilot-sdk`](https://www.npmjs.com/package/@github/copilot-sdk).

Modeled after the [CatClaw](../CatClaw) stack (which is mounted as a read-only reference in `javis.code-workspace`), but written from scratch in this repo. All Microsoft-internal subsystems are intentionally absent.

## Features

- **GitHub device-flow sign-in** with cached credentials.
- **Multi-session chat** with streaming responses, abort, optimistic rendering, persisted history under `~/.javis/`.
- **Model picker** per session, sourced from the SDK.
- **Settings dialog** — theme (dark/light/system), default model, shell permissions (auto-approve read-only, allow/block patterns, default tier), hotkeys, close-to-tray, launch-on-startup.
- **Permission engine** for shell/MCP/write/read requests — auto-allow / always-allow / per-session / once / deny, with a JSONL audit log at `~/.javis/audit.log`.
- **Image attachments** — paste, drag-drop, or pick PNG/JPEG/WEBP/GIF; vision-capable model warning when the current model can't handle them.
- **System tray** — Show / Hide / New chat / Mini mode / Settings / Sign out / Quit.
- **Global hotkeys** — show/hide the main window and open mini mode from anywhere.
- **Mini-mode** — frameless, always-on-top quick-prompt window that posts to the most-recent session.

## Tech stack

- **Frontend**: React 19 + TypeScript 5.7 + Vite 6 + Tailwind v4 + shadcn/ui (Radix primitives) + TanStack Query 5 + React Router 7 (HashRouter).
- **Desktop**: Electron 33 (sandboxed renderer, `contextIsolation: true`, single global per IPC namespace via `contextBridge`).
- **Backend**: `@github/copilot-sdk` driven from the main process; one `SessionManager` keeps SDK sessions, the local index, and IPC events in sync.
- **Testing**: Vitest + happy-dom.
- **Packaging**: electron-builder (DMG / NSIS / AppImage).
- **Package manager**: pnpm 10.

## Running locally

### 1. Prerequisites

- **Node.js 22.18 or newer** — check with `node -v`. The `engines.node` field requires `>=22.18.0`.
- **pnpm 10.32.1** — enable through corepack:

  ```powershell
  corepack enable
  corepack prepare pnpm@10.32.1 --activate
  ```

- A **GitHub account with Copilot access** — required for the device-flow sign-in once the app boots.

### 2. Install dependencies

From the `Javis/` folder:

```powershell
pnpm install
```

This pulls public npm packages only — no Azure DevOps or other private feeds.

### 3. Launch the app

```powershell
pnpm run electron:dev
```

What this does:

1. Runs `vite build` once to produce `dist-electron/main.js` and `dist-electron/preload.cjs`.
2. Spawns `electron .` which loads the main process and points the renderer at the dev server.
3. The renderer hot-reloads on source changes in `src/`. Electron-main changes require restarting the command.

On first launch you'll see the **Sign in** screen — click **Sign in with GitHub**, copy the displayed device code, paste it into the browser tab Javis opens, and the app will pick up the session automatically.

### 4. (Optional) Renderer-only dev loop

If you're only iterating on UI and don't need the Electron shell, `pnpm run dev` starts the Vite dev server alone at <http://localhost:5173>. Most features (auth, sessions, chat) will fail because they require the preload-exposed IPC bridge.

### 5. Test, typecheck, build

```powershell
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run (single pass)
pnpm run test:watch   # vitest watch mode
pnpm run build:vite   # renderer + electron bundle only — fastest "does it compile"
pnpm run build        # full: typecheck + vite build + electron-builder installer
```

### 6. Data on disk

All Javis state lives under `~/.javis/` (`%USERPROFILE%\.javis\` on Windows), mode `0o700`:

| Path                           | Contents                                                      |
| ------------------------------ | ------------------------------------------------------------- |
| `settings.json`                | Theme, default model, permission rules, hotkeys, window prefs |
| `sessions/sessions-index.json` | Lightweight session metadata (title, model, timestamps)       |
| `attachments/<sessionId>/`     | Pasted/dropped images, mode `0o600`                           |
| `audit.log`                    | JSONL append-only record of every permission decision         |

The Copilot SDK keeps its own credentials under `~/.copilot/`. Sign out clears both.

### 7. Troubleshooting

- **`Electron failed to install correctly, please delete node_modules/electron and try installing again`** — pnpm 10 skips lifecycle scripts by default; the `pnpm.onlyBuiltDependencies` array in `package.json` whitelists `electron` and `esbuild`. If you still hit this (e.g. after wiping `node_modules` with a different pnpm version), run `pnpm rebuild electron esbuild` to re-trigger the postinstall download.
- **"Unsupported engine" warning from pnpm** — upgrade Node to 22.18+; older 22.x will still run but is not supported.
- **Sign-in window doesn't open the browser** — check `appAPI.openExternal` permissions; on Windows make sure your default browser is set.
- **Global hotkey doesn't fire** — the OS may have it bound. Change it in **Settings → Hotkeys**, then close and re-open Settings to re-register.
- **Tray icon missing on Windows** — the bundled icon is a placeholder data-URL PNG; drop a real `tray.png` under `resources/` and rebuild.

## Project layout

```
Javis/
├─ common/              Shared types between main and renderer
│  ├─ ipc-contract.ts   Single source of truth for IPC channels
│  ├─ settings-schema.ts
│  └─ logger.ts
├─ electron/            Main process (Node)
│  ├─ main.ts           Composition root
│  ├─ preload.cjs       Renderer bridge
│  ├─ mini-mode-preload.cjs
│  ├─ mini-mode-window.ts
│  ├─ tray.ts
│  ├─ global-shortcuts.ts
│  ├─ auth-manager.ts
│  ├─ sessions/         SessionManager + on-disk index
│  ├─ permissions/      Classifier + policy + audit + approval broker
│  ├─ attachments/      Image save/remove helpers
│  ├─ settings/         Atomic settings store
│  └─ ipc/              One file per IPC namespace
├─ src/                 React renderer (Vite entry: src/main.tsx)
│  ├─ App.tsx
│  ├─ components/ui/    shadcn/ui primitives
│  ├─ features/
│  │  ├─ auth/
│  │  ├─ sessions/
│  │  ├─ chat/
│  │  ├─ models/
│  │  ├─ settings/
│  │  ├─ permissions/
│  │  ├─ attachments/
│  │  ├─ home/
│  │  └─ theme/
│  └─ mini-mode/        Separate entry for the quick-prompt window
├─ index.html
├─ mini-mode.html
├─ vite.config.ts       Multi-entry: index + mini-mode + vite-plugin-electron
├─ vitest.config.ts
├─ tsconfig.json / tsconfig.node.json
├─ electron-builder.json5
├─ package.json
└─ javis.code-workspace
```

## Quick-start cheat sheet

```powershell
# 1. Install
pnpm install

# 2. Run the desktop app
pnpm run electron:dev

# 3. Iterate
pnpm typecheck
pnpm test
pnpm run build:vite
```

## Using CatClaw as a reference

Open `javis.code-workspace` in VS Code. The `CatClaw/` root is mounted **read-only** so you can browse its source for patterns (IPC contract shape, session lifecycle, permission policy structure) without accidentally editing it.
