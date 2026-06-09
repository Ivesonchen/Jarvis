/**
 * Image-attachment utilities. Saves pasted/dropped images under
 * `~/.jarvis/attachments/<sessionId>/<uuid>.<ext>` (mode 0600) so the SDK
 * can attach them by absolute path.
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { createLogger } from "@common/logger";

import { getAttachmentsDir } from "../app-paths";

const log = createLogger("attachments");

/** 20 MB hard cap (matches typical Copilot image limits). */
const MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
};

function extFor(mimeType: string): string {
    const ext = ALLOWED[mimeType];
    if (!ext) throw new Error(`Unsupported image MIME type: ${mimeType}`);
    return ext;
}

export interface SavedAttachment {
    path: string;
    mimeType: string;
    byteSize: number;
}

/** Persist a base64-encoded image. Returns the absolute file path. */
export async function saveImageAttachment(
    sessionId: string,
    base64: string,
    mimeType: string,
): Promise<SavedAttachment> {
    if (!sessionId || typeof sessionId !== "string") {
        throw new Error("sessionId is required");
    }
    // Reject IDs containing path separators to avoid escape.
    if (sessionId.includes("/") || sessionId.includes("\\") || sessionId.includes("..")) {
        throw new Error("Invalid sessionId");
    }

    const ext = extFor(mimeType);
    const stripped = base64.replace(/^data:[^;]+;base64,/, "");
    const buf = Buffer.from(stripped, "base64");
    if (buf.length === 0) throw new Error("Empty image data");
    if (buf.length > MAX_BYTES) throw new Error(`Image too large (>${MAX_BYTES} bytes)`);

    const dir = path.join(getAttachmentsDir(), sessionId);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, `${randomUUID()}.${ext}`);
    await fs.writeFile(file, buf, { mode: 0o600 });
    log.info("saved attachment", file, buf.length);
    return { path: file, mimeType, byteSize: buf.length };
}

/** Best-effort cleanup — does not throw if the file is already gone. */
export async function removeAttachment(absPath: string): Promise<void> {
    const root = getAttachmentsDir();
    const resolved = path.resolve(absPath);
    if (!resolved.startsWith(path.resolve(root) + path.sep)) {
        throw new Error("Attachment path escapes the attachments directory");
    }
    try {
        await fs.unlink(resolved);
    } catch (err) {
        log.warn("removeAttachment failed:", err);
    }
}
