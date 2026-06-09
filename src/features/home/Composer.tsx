import { ArrowUp, Camera, ImagePlus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DefaultModelPicker from "@/features/home/DefaultModelPicker";
import { cn } from "@/lib/utils";

/** Image file staged in the composer before a session exists. */
export interface PendingComposerFile {
    base64: string;
    mimeType: string;
    displayName: string;
    byteSize: number;
    previewUrl: string;
}

interface Props {
    placeholder?: string;
    disabled?: boolean;
    onSubmit: (value: string, files: PendingComposerFile[]) => void | Promise<void>;
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

function base64ToBlob(base64: string, mimeType: string): Blob {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
}

/**
 * Welcome-screen composer. Single-row pill with:
 *   - left:   "+" → upload image or capture primary screen
 *   - center: auto-growing textarea
 *   - right:  default-model picker icon + send arrow
 *
 * Staged files render above the pill so the pill itself stays compact.
 * Files are handed to `onSubmit` so HomePage can persist them under the
 * new session's id (the renderer needs a sessionId before
 * `attachmentsAPI.saveImage` works).
 */
export default function Composer({ placeholder, disabled, onSubmit }: Props) {
    const [value, setValue] = useState("");
    const [files, setFiles] = useState<PendingComposerFile[]>([]);
    const [error, setError] = useState<string | null>(null);
    const taRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-grow textarea by syncing scrollHeight.
    useEffect(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
    }, [value]);

    // Revoke any unsent object URLs when this composer unmounts.
    useEffect(() => {
        return () => {
            for (const f of files) URL.revokeObjectURL(f.previewUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const addFiles = async (list: FileList | File[]): Promise<void> => {
        const next: PendingComposerFile[] = [];
        for (const f of Array.from(list)) {
            if (!SUPPORTED_MIME.has(f.type)) {
                setError(`Unsupported image type: ${f.type || "unknown"}`);
                continue;
            }
            try {
                const base64 = await fileToBase64(f);
                next.push({
                    base64,
                    mimeType: f.type,
                    displayName: f.name,
                    byteSize: f.size,
                    previewUrl: URL.createObjectURL(f),
                });
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            }
        }
        if (next.length > 0) setFiles((prev) => [...prev, ...next]);
    };

    const captureScreen = async (): Promise<void> => {
        try {
            const shot = await window.screenAPI.capturePrimary();
            const blob = base64ToBlob(shot.base64, shot.mimeType);
            const previewUrl = URL.createObjectURL(blob);
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            setFiles((prev) => [
                ...prev,
                {
                    base64: shot.base64,
                    mimeType: shot.mimeType,
                    displayName: `screenshot-${stamp}.png`,
                    byteSize: blob.size,
                    previewUrl,
                },
            ]);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    const removeFile = (idx: number): void => {
        setFiles((prev) => {
            const next = [...prev];
            const removed = next.splice(idx, 1)[0];
            if (removed) URL.revokeObjectURL(removed.previewUrl);
            return next;
        });
    };

    const submit = (): void => {
        const trimmed = value.trim();
        if ((!trimmed && files.length === 0) || disabled) return;
        const toSend = files;
        setValue("");
        setFiles([]);
        void onSubmit(trimmed, toSend);
    };

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
            className="mx-auto w-full max-w-3xl"
        >
            <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                hidden
                onChange={(e) => {
                    if (e.target.files) void addFiles(e.target.files);
                    e.target.value = "";
                }}
            />

            {files.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                    {files.map((f, i) => (
                        <div
                            key={f.previewUrl}
                            className="group relative h-16 w-16 overflow-hidden rounded-md border border-(--border) bg-(--muted)/30"
                            title={f.displayName}
                        >
                            <img
                                src={f.previewUrl}
                                alt={f.displayName}
                                className="h-full w-full object-cover"
                            />
                            <button
                                type="button"
                                onClick={() => removeFile(i)}
                                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
                                aria-label={`Remove ${f.displayName}`}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {error && <div className="mb-1 px-3 text-xs text-(--destructive)">{error}</div>}

            <div
                className={cn(
                    "flex items-end gap-1 rounded-full border border-(--border) bg-(--card)/40 px-2 py-1.5 shadow-sm",
                    "focus-within:border-(--ring)/60",
                )}
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            disabled={disabled}
                            title="Add attachment"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-(--muted-foreground) hover:bg-(--accent) hover:text-(--foreground) disabled:opacity-40"
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                            <ImagePlus className="h-4 w-4" />
                            Upload image…
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void captureScreen()}>
                            <Camera className="h-4 w-4" />
                            Capture screen
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <textarea
                    ref={taRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    placeholder={placeholder ?? "Ask anything"}
                    disabled={disabled}
                    rows={1}
                    className="min-h-9 flex-1 resize-none self-center bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-(--muted-foreground) disabled:opacity-60"
                />

                <div className="flex shrink-0 items-center gap-1">
                    <DefaultModelPicker disabled={disabled} />
                    <Button
                        type="submit"
                        size="icon"
                        disabled={disabled || (!value.trim() && files.length === 0)}
                        className="h-9 w-9 rounded-full"
                        title="Send"
                    >
                        <ArrowUp className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </form>
    );
}
