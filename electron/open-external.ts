/**
 * Allowlist-gated `shell.openExternal` wrapper.
 *
 * Never call `shell.openExternal` directly on AI- or user-supplied URLs.
 * Every external link the app opens must be vetted here.
 *
 * Current allowlist: GitHub device-flow page (for sign-in) and the GitHub
 * Copilot product pages. Extend deliberately.
 */
import { shell } from "electron";

import { createLogger } from "@common/logger";

const log = createLogger("openExternal");

const ALLOWED_HTTPS_HOSTS = new Set([
    "github.com",
    "docs.github.com",
    "githubcopilot.com",
    "copilot.github.com",
]);

export async function openExternalSafe(url: string): Promise<void> {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`Refusing to open malformed URL: ${url}`);
    }
    if (parsed.protocol !== "https:") {
        throw new Error(`Refusing to open non-https URL (got ${parsed.protocol}): ${url}`);
    }
    if (!ALLOWED_HTTPS_HOSTS.has(parsed.hostname)) {
        throw new Error(`Refusing to open URL outside allowlist: ${parsed.hostname}`);
    }
    log.info("opening external:", parsed.toString());
    await shell.openExternal(parsed.toString());
}
