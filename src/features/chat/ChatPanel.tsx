import { ArrowUp, Camera, ImagePlus, Plus, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ChatAttachment } from "@common/ipc-contract";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AttachmentStrip from "@/features/attachments/AttachmentStrip";
import { useAttachments } from "@/features/attachments/useAttachments";
import MessageBubble from "@/features/chat/MessageBubble";
import StreamingIndicator from "@/features/chat/StreamingIndicator";
import { useChat } from "@/features/chat/useChat";
import ModelPicker from "@/features/models/ModelPicker";
import { useModels } from "@/features/models/useModels";
import PermissionCards from "@/features/permissions/PermissionCards";
import { useSessionDetail } from "@/features/sessions/useSessions";
import { cn } from "@/lib/utils";

interface Props {
    sessionId: string | undefined;
    /**
     * Optional prompt seeded from the welcome screen. ChatPanel will send it
     * itself the first time it mounts for this sessionId, ensuring the IPC
     * subscription is already in place when the SDK starts emitting events.
     */
    pendingPrompt?: string | undefined;
    /** Attachments seeded from the welcome screen alongside `pendingPrompt`. */
    pendingAttachments?: ChatAttachment[] | undefined;
    /** Called after the seeded prompt is consumed so HomePage can clear it. */
    onPendingPromptConsumed?: (() => void) | undefined;
}

export default function ChatPanel({
    sessionId,
    pendingPrompt,
    pendingAttachments,
    onPendingPromptConsumed,
}: Props) {
    const { messages, isBusy, isStreaming, reasoning, toolStatuses, error, send, abort, isLoading } =
        useChat(sessionId);
    const detail = useSessionDetail(sessionId);
    const attachments = useAttachments(sessionId);
    const { data: models = [] } = useModels();
    const [input, setInput] = useState("");
    const [captureError, setCaptureError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const taRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const seededRef = useRef<string | null>(null);
    const lastAssistant = messages[messages.length - 1]?.role === "assistant"
        ? messages[messages.length - 1]
        : undefined;
    const lastStreamingMessageId = isStreaming ? lastAssistant?.id : undefined;
    const hasAssistantText = isStreaming && (lastAssistant?.content?.length ?? 0) > 0;

    const currentModelId = detail.data?.summary.lastModel;
    const currentModel = currentModelId ? models.find((m) => m.id === currentModelId) : undefined;
    const visionWarning =
        attachments.pending.length > 0 && currentModel && !currentModel.supportsVision;

    // Auto-scroll to the bottom on new messages, streaming deltas, or new
    // reasoning / tool entries.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [messages, reasoning, toolStatuses, isBusy]);

    // Auto-grow the textarea by syncing scrollHeight (mirrors the welcome
    // composer so the bottom control doesn't visually jump between layouts).
    useEffect(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
    }, [input]);

    // Return focus to the composer when a reply finishes (isBusy: true → false)
    // so the user can immediately keep typing without reaching for the mouse.
    const wasBusyRef = useRef(false);
    useEffect(() => {
        if (wasBusyRef.current && !isBusy) {
            // Defer one frame so the textarea has re-rendered as enabled.
            requestAnimationFrame(() => taRef.current?.focus());
        }
        wasBusyRef.current = isBusy;
    }, [isBusy]);

    // Consume a seeded prompt exactly once per sessionId (avoids re-firing on
    // re-renders triggered by state inside ChatPanel itself).
    useEffect(() => {
        if (!sessionId || !pendingPrompt) return;
        if (seededRef.current === sessionId) return;
        seededRef.current = sessionId;
        void send(pendingPrompt, pendingAttachments).catch(() => {
            /* surfaced via the `error` field below */
        });
        onPendingPromptConsumed?.();
    }, [sessionId, pendingPrompt, pendingAttachments, send, onPendingPromptConsumed]);

    const handleSubmit = async (e: React.FormEvent): Promise<void> => {
        e.preventDefault();
        const trimmed = input.trim();
        if ((!trimmed && attachments.pending.length === 0) || !sessionId || isStreaming) return;
        const toSend = attachments.pending.map((p) => ({
            path: p.path,
            mimeType: p.mimeType,
            byteSize: p.byteSize,
            ...(p.displayName ? { displayName: p.displayName } : {}),
        }));
        setInput("");
        attachments.clear();
        try {
            await send(trimmed, toSend.length > 0 ? toSend : undefined);
        } catch {
            // Error is surfaced via the `error` field below.
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
        if (!sessionId) return;
        if (e.clipboardData?.items?.length) {
            let hasImage = false;
            for (let i = 0; i < e.clipboardData.items.length; i++) {
                if (e.clipboardData.items[i].kind === "file") {
                    hasImage = true;
                    break;
                }
            }
            if (hasImage) {
                e.preventDefault();
                void attachments.addFromClipboard(e.clipboardData.items);
            }
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLFormElement>): void => {
        if (!sessionId) return;
        if (e.dataTransfer?.files?.length) {
            e.preventDefault();
            void attachments.addFromDrop(e.dataTransfer.files);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLFormElement>): void => {
        if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit(e as unknown as React.FormEvent);
        }
    };

    const captureScreen = async (): Promise<void> => {
        if (!sessionId) return;
        try {
            const shot = await window.screenAPI.capturePrimary();
            const bin = atob(shot.base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            const file = new File([bytes], `screenshot-${stamp}.png`, { type: shot.mimeType });
            setCaptureError(null);
            await attachments.addFile(file);
        } catch (err) {
            setCaptureError(err instanceof Error ? err.message : String(err));
        }
    };

    if (!sessionId) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-(--muted-foreground)">
                Select a chat from the left or create a new one.
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-(--border) px-4 py-2">
                <div className="truncate text-sm font-medium">
                    {detail.data?.summary.title ?? "Chat"}
                </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
                {isLoading ? (
                    <div className="text-sm text-(--muted-foreground)">Loading session…</div>
                ) : messages.length === 0 && !isBusy ? (
                    <div className="flex h-full items-center justify-center text-sm text-(--muted-foreground)">
                        Ask Javis anything to get started.
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {messages.map((m) => (
                            <MessageBubble
                                key={m.id}
                                message={m}
                                isStreaming={isStreaming && m.id === lastStreamingMessageId}
                            />
                        ))}
                        <StreamingIndicator
                            isBusy={isBusy}
                            hasAssistantText={!!hasAssistantText}
                            reasoning={reasoning}
                            toolStatuses={toolStatuses}
                        />
                    </div>
                )}
            </div>

            {error && (
                <div className="border-t border-(--border) bg-(--destructive)/10 px-6 py-2 text-xs text-(--destructive)">
                    {error}
                </div>
            )}

            <PermissionCards sessionId={sessionId} />

            {(attachments.error || captureError || visionWarning) && (
                <div className="border-t border-(--border) bg-(--secondary)/40 px-6 py-2 text-xs text-(--muted-foreground)">
                    {attachments.error && <div className="text-(--destructive)">{attachments.error}</div>}
                    {captureError && <div className="text-(--destructive)">{captureError}</div>}
                    {visionWarning && (
                        <div>
                            Selected model <code>{currentModel?.name}</code> does not support images. Switch to a
                            vision-capable model before sending.
                        </div>
                    )}
                </div>
            )}

            <form
                onSubmit={handleSubmit}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-t border-(--border) bg-(--background) px-6 py-3"
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    hidden
                    onChange={(e) => {
                        if (e.target.files) void attachments.addFromDrop(e.target.files);
                        e.target.value = "";
                    }}
                />
                <div className="mx-auto w-full max-w-3xl">
                    {attachments.pending.length > 0 && (
                        <div className="mb-2">
                            <AttachmentStrip
                                attachments={attachments.pending}
                                onRemove={attachments.remove}
                            />
                        </div>
                    )}
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
                                    disabled={isStreaming}
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
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            placeholder="Ask anything"
                            disabled={isStreaming}
                            rows={1}
                            className="min-h-9 flex-1 resize-none self-center bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-(--muted-foreground) disabled:opacity-60"
                        />

                        <div className="flex shrink-0 items-center gap-1">
                            <ModelPicker
                                sessionId={sessionId}
                                currentModel={detail.data?.summary.lastModel}
                            />
                            {isStreaming ? (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    onClick={() => void abort()}
                                    title="Stop generating"
                                    aria-label="Stop generating"
                                    className="h-9 w-9 rounded-full"
                                >
                                    <Square className="h-4 w-4" />
                                </Button>
                            ) : (
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={!input.trim() && attachments.pending.length === 0}
                                    className="h-9 w-9 rounded-full"
                                    title="Send"
                                >
                                    <ArrowUp className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}
