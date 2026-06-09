/**
 * Resolve the path to the bundled GitHub Copilot CLI binary.
 *
 * The CLI is published as platform-specific npm packages
 * (`@github/copilot-<platform>-<arch>`) that ship a prebuilt binary at the
 * package root. They come in as optional deps of `@github/copilot` (which is
 * itself a transitive dep of `@github/copilot-sdk`).
 *
 * Resolution strategy:
 *   1. Try `require.resolve` from our own location (works in dev when the
 *      package happens to be hoisted).
 *   2. Try `require.resolve` from the SDK's location (works under pnpm,
 *      where the platform binary lives next to `@github/copilot`'s own
 *      `node_modules/@github/`).
 *   3. Fall back to packaged-build candidates under
 *      `resources/app.asar.unpacked/node_modules/`.
 *
 * Note: the package's `exports` field points directly at the binary, so
 * `require.resolve("@github/copilot-win32-x64")` returns the `.exe` path.
 */
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { createLogger } from "@common/logger";

const log = createLogger("cli-path");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireFromHere = createRequire(import.meta.url);

function packageNameFor(platform: NodeJS.Platform, arch: string): string {
    if (platform === "darwin" && arch === "arm64") return "@github/copilot-darwin-arm64";
    if (platform === "darwin" && arch === "x64") return "@github/copilot-darwin-x64";
    if (platform === "win32" && arch === "x64") return "@github/copilot-win32-x64";
    if (platform === "win32" && arch === "arm64") return "@github/copilot-win32-arm64";
    if (platform === "linux" && arch === "x64") return "@github/copilot-linux-x64";
    if (platform === "linux" && arch === "arm64") return "@github/copilot-linux-arm64";
    throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

function tryResolve(packageName: string): string | null {
    // 1. Direct resolution from our own location.
    try {
        return requireFromHere.resolve(packageName);
    } catch {
        /* keep trying */
    }

    // 2. Through the SDK's own resolver (handles pnpm layout).
    try {
        const sdkEntry = requireFromHere.resolve("@github/copilot-sdk/package.json");
        const sdkRequire = createRequire(sdkEntry);
        return sdkRequire.resolve(packageName);
    } catch {
        /* fall through */
    }

    // 3. Through @github/copilot's resolver (under pnpm, the platform
    //    binaries are only symlinked as siblings of `@github/copilot`, not
    //    of `@github/copilot-sdk`).
    try {
        const sdkEntry = requireFromHere.resolve("@github/copilot-sdk/package.json");
        const sdkRequire = createRequire(sdkEntry);
        const copilotEntry = sdkRequire.resolve("@github/copilot/package.json");
        const copilotRequire = createRequire(copilotEntry);
        return copilotRequire.resolve(packageName);
    } catch {
        /* fall through */
    }

    return null;
}

let cached: string | null = null;

export function getBundledCliPath(): string {
    if (cached) return cached;

    const packageName = packageNameFor(process.platform, process.arch);

    // Strategy 1+2: ask Node to resolve the package; honors the `exports` field
    // and returns the actual binary path.
    const resolved = tryResolve(packageName);
    if (resolved && !resolved.includes(".asar/") && !resolved.includes(".asar\\")) {
        if (fs.existsSync(resolved)) {
            log.info("found Copilot CLI via require.resolve:", resolved);
            cached = resolved;
            return resolved;
        }
    }

    // Strategy 3: packaged-build candidates (electron-builder unpacks platform
    // binaries under app.asar.unpacked per `electron-builder.json5`).
    const suffix = process.platform === "win32" ? ".exe" : "";
    const macAppRel = path.join(packageName, "copilot.app", "Contents", "MacOS", "copilot");
    const flatRel = path.join(packageName, "copilot" + suffix);
    const candidates: string[] = [];

    if (process.resourcesPath) {
        candidates.push(
            path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", macAppRel),
            path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", flatRel),
        );
    }
    candidates.push(
        path.join(__dirname, "..", "node_modules", flatRel),
        path.join(process.cwd(), "node_modules", flatRel),
    );

    for (const full of candidates) {
        if (full.includes(".asar/") || full.includes(".asar\\")) continue;
        if (fs.existsSync(full)) {
            log.info("found Copilot CLI:", full);
            cached = full;
            return full;
        }
    }

    throw new Error(
        `Copilot CLI not found.\n` +
        `Tried require.resolve("${packageName}") and:\n` +
        candidates.map((p) => "  - " + p).join("\n"),
    );
}

/** For tests only — clears the cache so a different platform can be exercised. */
export function _resetCliPathCacheForTests(): void {
    cached = null;
}
