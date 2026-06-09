/**
 * Persistent app settings at `~/.javis/settings.json`. Atomic writes,
 * zod-validated. Falls back to defaults if the file is missing/invalid
 * rather than crashing the app at boot — better to lose preferences than
 * to leave the user with a dead window.
 *
 * Mutations broadcast a `settings:changed` event so the renderer (and any
 * other interested main-process subscribers like the permission policy)
 * can react.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createLogger } from "@common/logger";
import { type AppSettings, AppSettingsSchema, defaultSettings } from "@common/settings-schema";

import { getDataDir } from "../app-paths";

const log = createLogger("settings-store");

function settingsPath(): string {
    return path.join(getDataDir(), "settings.json");
}

let cache: AppSettings | undefined;
const listeners = new Set<(settings: AppSettings) => void>();

export function getSettings(): AppSettings {
    if (cache) return cache;
    cache = readFromDisk();
    return cache;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
    const current = getSettings();
    const next = AppSettingsSchema.parse({ ...current, ...patch, version: 1 });
    writeToDisk(next);
    cache = next;
    for (const fn of listeners) {
        try {
            fn(next);
        } catch (err) {
            log.warn("settings listener threw:", err);
        }
    }
    return next;
}

export function onSettingsChanged(fn: (settings: AppSettings) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function getSettingsFilePath(): string {
    return settingsPath();
}

function readFromDisk(): AppSettings {
    const file = settingsPath();
    if (!fs.existsSync(file)) {
        const defaults = defaultSettings();
        writeToDisk(defaults);
        return defaults;
    }

    let raw: string;
    try {
        raw = fs.readFileSync(file, "utf-8");
    } catch (err) {
        log.warn("failed to read settings.json:", err);
        return defaultSettings();
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw) as unknown;
    } catch (err) {
        log.warn("settings.json invalid JSON, using defaults:", err);
        return defaultSettings();
    }

    const result = AppSettingsSchema.safeParse(parsed);
    if (!result.success) {
        log.warn("settings.json failed schema validation, using defaults:", result.error.message);
        return defaultSettings();
    }
    return result.data;
}

function writeToDisk(settings: AppSettings): void {
    const file = settingsPath();
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, file);
}
