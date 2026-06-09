/**
 * Rasterize resources/icon.svg + resources/tray.svg into every bitmap variant
 * Electron and electron-builder need.
 *
 * Outputs:
 *   resources/icon-{16,24,32,48,64,128,256,512,1024}.png  — app icon raster
 *   resources/icon.png                                    — alias of 1024 (BrowserWindow + Linux)
 *   resources/icon.ico                                    — Windows installer + .exe icon
 *   resources/tray.png, tray@2x.png                       — tray icon (16/32 px)
 *   public/icon.svg                                       — copy for the renderer favicon
 *
 * `mac.icon` in electron-builder.json5 points to resources/icon.png; the
 * builder converts to .icns on the fly (or pass --mac=icon.icns if you
 * prefer an explicit asset).
 *
 * Run via `pnpm icons`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pngToIco from "png-to-ico";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RES = path.join(ROOT, "resources");
const PUB = path.join(ROOT, "public");

const APP_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function main() {
  await ensureDir(RES);
  await ensureDir(PUB);

  const appSvg = await fs.readFile(path.join(RES, "icon.svg"));
  const traySvg = await fs.readFile(path.join(RES, "tray.svg"));

  // App icon — full set of PNG sizes.
  for (const size of APP_SIZES) {
    const out = path.join(RES, `icon-${size}.png`);
    await sharp(appSvg, { density: Math.max(300, size * 2) })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
    process.stdout.write(`  ${path.relative(ROOT, out)}\n`);
  }
  // Canonical icon.png — what electron-builder & BrowserWindow point at.
  await fs.copyFile(path.join(RES, "icon-1024.png"), path.join(RES, "icon.png"));

  // Windows .ico — pack the small sizes into one multi-resolution file.
  const icoBuffers = await Promise.all(
    ICO_SIZES.map((size) =>
      sharp(appSvg, { density: Math.max(300, size * 2) })
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
    ),
  );
  await fs.writeFile(path.join(RES, "icon.ico"), await pngToIco(icoBuffers));
  process.stdout.write(`  ${path.relative(ROOT, path.join(RES, "icon.ico"))}\n`);

  // Tray bitmaps.
  for (const [size, name] of [
    [16, "tray.png"],
    [32, "tray@2x.png"],
  ]) {
    const out = path.join(RES, name);
    await sharp(traySvg, { density: 600 })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
    process.stdout.write(`  ${path.relative(ROOT, out)}\n`);
  }

  // Renderer favicon — copy SVG into public/ where Vite serves it as /icon.svg.
  await fs.copyFile(path.join(RES, "icon.svg"), path.join(PUB, "icon.svg"));
  process.stdout.write(`  ${path.relative(ROOT, path.join(PUB, "icon.svg"))}\n`);

  process.stdout.write("\nicons built\n");
}

main().catch((err) => {
  process.stderr.write(`icon build failed: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
