import { copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    electron([
      {
        entry: "electron/main.ts",
        onstart(args) {
          // Copy the CommonJS preloads alongside the bundled main.
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

