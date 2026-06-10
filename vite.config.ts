import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import electron from "vite-plugin-electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Copy the hand-written CommonJS preloads into dist-electron/ during any
// Vite build (incl. CI). vite-plugin-electron's `onstart` hook only fires
// when the plugin launches Electron in dev — without this, packaged builds
// from a clean checkout ship an app.asar that's missing preload.cjs, and
// the renderer crashes on `window.authAPI` being undefined.
function copyPreloads(): Plugin {
  return {
    name: "jarvis:copy-preloads",
    apply: "build",
    closeBundle() {
      mkdirSync("dist-electron", { recursive: true });
      copyFileSync("electron/preload.cjs", "dist-electron/preload.cjs");
      copyFileSync("electron/mini-mode-preload.cjs", "dist-electron/mini-mode-preload.cjs");
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  // Emit relative asset URLs (`./assets/foo.js`) so the packaged renderer can
  // resolve them under the `file://` protocol — otherwise Vite generates
  // absolute `/assets/...` paths that resolve to the filesystem root and
  // cause a black window after installation.
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@common": path.resolve(__dirname, "./common"),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    copyPreloads(),
    electron([
      {
        entry: "electron/main.ts",
        onstart(args) {
          // Dev only: the build-time copy plugin handles packaged builds.
          copyFileSync("electron/preload.cjs", "dist-electron/preload.cjs");
          copyFileSync("electron/mini-mode-preload.cjs", "dist-electron/mini-mode-preload.cjs");
          const env = { ...process.env };
          delete env.ELECTRON_RUN_AS_NODE;
          void args.startup([".", "--no-sandbox"], { env });
        },
        vite: {
          resolve: {
            alias: {
              "@common": path.resolve(__dirname, "./common"),
            },
          },
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron", "@github/copilot-sdk"],
            },
          },
        },
      },
    ]),
  ],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "index.html"),
        "mini-mode": path.resolve(__dirname, "mini-mode.html"),
      },
    },
  },
});

