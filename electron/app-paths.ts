/**
 * Filesystem paths used by Jarvis.
 *
 * All state lives under `~/.jarvis/` on every platform — keeps the layout
 * greppable across machines and mirrors CatClaw's `~/.copilot/` convention.
 *
 * `app.getPath("userData")` would be more "platform-idiomatic" (AppData on
 * Windows, Application Support on macOS) but makes ad-hoc inspection harder.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ROOT_DIRNAME = ".jarvis";

let cachedDataDir: string | null = null;

export function getDataDir(): string {
    if (cachedDataDir) return cachedDataDir;
    const dir = path.join(os.homedir(), ROOT_DIRNAME);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    cachedDataDir = dir;
    return dir;
}

export function getSessionsDir(): string {
    const dir = path.join(getDataDir(), "sessions");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
}

export function getAttachmentsDir(): string {
    const dir = path.join(getDataDir(), "attachments");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
}

export function getSettingsPath(): string {
    return path.join(getDataDir(), "settings.json");
}

export function getAuditLogPath(): string {
    return path.join(getDataDir(), "audit.log");
}

export function getLogsDir(): string {
    const dir = path.join(getDataDir(), "logs");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
}

/** Used by tests to force a re-read of the home dir. */
export function _resetCacheForTests(): void {
    cachedDataDir = null;
}

/**
 * Resolve a file bundled under `resources/` regardless of dev vs packaged.
 *
 *  - Packaged: `process.resourcesPath/<name>` (electron-builder's
 *    `extraResources` with `"to": "."` puts the bitmap right there).
 *  - Dev: walk up from `dist-electron/` to the project root.
 *
 * Returns the resolved path even if the file doesn't exist — callers should
 * check with `fs.existsSync` (or rely on `nativeImage.createFromPath` returning
 * an empty image).
 */
export function getBundledResource(name: string): string {
    if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, name))) {
        return path.join(process.resourcesPath, name);
    }
    // Dev: __dirname in the bundled main is .../dist-electron, so ../resources hits the source tree.
    // Use process.cwd() as a fallback when this module is consumed from tests.
    const fromCwd = path.join(process.cwd(), "resources", name);
    return fromCwd;
}
