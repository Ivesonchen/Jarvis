/**
 * Screen-capture IPC. Returns a PNG of the primary display so the renderer
 * can attach it like a pasted image. We keep the implementation in main
 * because `desktopCapturer` is main-only and lets us avoid the renderer
 * permission prompts that `getDisplayMedia` would trigger.
 */
import { desktopCapturer, screen } from "electron";

import { createLogger } from "@common/logger";

import { ipcHandle } from "./ipc-handle";

const log = createLogger("screen-ipc");

export function registerScreenIpc(): void {
    ipcHandle("screen:capturePrimary", async () => {
        const primary = screen.getPrimaryDisplay();
        const { width, height } = primary.size;
        const scale = primary.scaleFactor || 1;
        // Ask for a thumbnail close to the real device-pixel size so the
        // capture isn't downsampled. Cap a bit to avoid massive payloads on
        // 5K+ monitors.
        const thumbW = Math.min(Math.round(width * scale), 3840);
        const thumbH = Math.min(Math.round(height * scale), 2160);
        const sources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: thumbW, height: thumbH },
        });
        if (sources.length === 0) {
            log.warn("desktopCapturer returned no screen sources");
            return { success: false, error: "No screen source available" };
        }
        const picked =
            sources.find((s) => s.display_id === String(primary.id)) ?? sources[0];
        const thumbnail = picked.thumbnail;
        if (thumbnail.isEmpty()) {
            return { success: false, error: "Captured screen image is empty" };
        }
        const png = thumbnail.toPNG();
        const size = thumbnail.getSize();
        return {
            success: true,
            base64: png.toString("base64"),
            mimeType: "image/png",
            width: size.width,
            height: size.height,
        };
    });
}
