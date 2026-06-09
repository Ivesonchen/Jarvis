import { useCallback, useState } from "react";

import type { ChatAttachment } from "@common/ipc-contract";

export interface PendingAttachment extends ChatAttachment {
    /** Object URL for preview only (revoked after the send completes). */
    previewUrl: string;
}

const SUPPORTED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error ?? new Error("read failed"));
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== "string") {
                reject(new Error("FileReader returned non-string"));
                return;
            }
            const idx = result.indexOf(",");
            resolve(idx >= 0 ? result.slice(idx + 1) : result);
        };
        reader.readAsDataURL(file);
    });
}

/**
 * State container for the chat composer's pending image attachments.
 * Saves each File through `attachmentsAPI.saveImage` so the main process
 * holds a copy under `~/.javis/attachments/<sessionId>/`.
 */
export function useAttachments(sessionId: string | undefined) {
    const [pending, setPending] = useState<PendingAttachment[]>([]);
    const [error, setError] = useState<string | null>(null);

    const addFile = useCallback(
        async (file: File) => {
            if (!sessionId) return;
            if (!SUPPORTED_MIME.has(file.type)) {
                setError(`Unsupported image type: ${file.type || "unknown"}`);
                return;
            }
            try {
                const base64 = await fileToBase64(file);
                const { attachment } = await window.attachmentsAPI.saveImage(
                    sessionId,
                    base64,
                    file.type,
                );
                const url = URL.createObjectURL(file);
                setError(null);
                setPending((prev) => [
                    ...prev,
                    { ...attachment, displayName: file.name, previewUrl: url },
                ]);
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            }
        },
        [sessionId],
    );

    const addFromClipboard = useCallback(
        async (items: DataTransferItemList | null) => {
            if (!items) return;
            const files: File[] = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === "file") {
                    const f = item.getAsFile();
                    if (f && SUPPORTED_MIME.has(f.type)) files.push(f);
                }
            }
            for (const f of files) await addFile(f);
        },
        [addFile],
    );

    const addFromDrop = useCallback(
        async (files: FileList) => {
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                if (SUPPORTED_MIME.has(f.type)) await addFile(f);
            }
        },
        [addFile],
    );

    const remove = useCallback((path: string) => {
        setPending((prev) => {
            const removed = prev.find((p) => p.path === path);
            if (removed) URL.revokeObjectURL(removed.previewUrl);
            return prev.filter((p) => p.path !== path);
        });
        void window.attachmentsAPI.remove(path).catch(() => {/* best-effort */ });
    }, []);

    const clear = useCallback(() => {
        setPending((prev) => {
            for (const p of prev) URL.revokeObjectURL(p.previewUrl);
            return [];
        });
    }, []);

    return { pending, addFile, addFromClipboard, addFromDrop, remove, clear, error };
}
