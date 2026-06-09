/**
 * Per-session chat state hook. Subscribes to the streaming IPC events for
 * the given sessionId and exposes:
 *   - `messages`     – history + optimistic user bubble + streaming assistant
 *   - `reasoning`    – live "extended thinking" text + duration
 *   - `toolStatuses` – in-flight + recently completed tool calls
 *   - `isBusy`       – true between turn-start and session.idle
 *   - `isStreaming`  – legacy alias kept in sync with `isBusy`
 *   - `send/abort`   – mutations
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChatAttachment, ChatMessage, ToolStatus } from "@common/ipc-contract";

import { sessionDetailKey, useSessionDetail } from "@/features/sessions/useSessions";

type StreamingState = {
    messageId: string;
    content: string;
    startedAt: string;
};

export interface ReasoningState {
    /** Concatenated reasoning text from all deltas in the current turn. */
    text: string;
    /** When the first reasoning delta arrived. */
    startedAt: number;
    /** When the reasoning block finalized (set on `reasoningDone`). */
    completedAt: number | null;
}

export interface UseChatReturn {
    messages: ChatMessage[];
    /** True from `assistant.turn_start` until `session.idle`. */
    isBusy: boolean;
    /** Alias of `isBusy` plus the send mutation pending flag — used by the composer. */
    isStreaming: boolean;
    reasoning: ReasoningState | null;
    toolStatuses: ToolStatus[];
    error: string | null;
    /** Send a new user prompt to this session. Optimistically appends a user bubble. */
    send: (prompt: string, attachments?: ChatAttachment[]) => Promise<void>;
    /** Abort the in-flight response, if any. */
    abort: () => Promise<void>;
    /** Whether the initial history fetch has completed. */
    isLoading: boolean;
}

export function useChat(sessionId: string | undefined): UseChatReturn {
    const qc = useQueryClient();
    const detail = useSessionDetail(sessionId);
    const [streaming, setStreaming] = useState<StreamingState | null>(null);
    const [pendingUser, setPendingUser] = useState<ChatMessage | null>(null);
    const [reasoning, setReasoning] = useState<ReasoningState | null>(null);
    const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([]);
    const [isBusy, setIsBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Refs so rapid IPC events mutate state synchronously (setState batching
    // could otherwise lose deltas across micro-tasks).
    const bufferRef = useRef<StreamingState | null>(null);
    const reasoningRef = useRef<ReasoningState | null>(null);
    // When the user clicks Stop, late SDK events (a delta in flight before the
    // abort took effect, a turn_start from a tool-follow-up the SDK already
    // queued) would otherwise re-flip `streaming` / `isBusy` and re-disable
    // the composer. Suppress those events until the next send() or idle.
    const abortRequestedRef = useRef(false);

    // Reset all per-session state whenever the session changes.
    useEffect(() => {
        setStreaming(null);
        setPendingUser(null);
        setReasoning(null);
        setToolStatuses([]);
        setIsBusy(false);
        setError(null);
        bufferRef.current = null;
        reasoningRef.current = null;
        abortRequestedRef.current = false;
    }, [sessionId]);

    // Subscribe to IPC stream events.
    useEffect(() => {
        if (!sessionId) return;

        const offDelta = window.chatAPI.onStreamDelta((ev) => {
            if (ev.sessionId !== sessionId) return;
            if (abortRequestedRef.current) return;
            const current = bufferRef.current;
            if (!current || current.messageId !== ev.messageId) {
                const next: StreamingState = {
                    messageId: ev.messageId,
                    content: ev.deltaContent,
                    startedAt: new Date().toISOString(),
                };
                bufferRef.current = next;
                setStreaming(next);
            } else {
                const next: StreamingState = {
                    ...current,
                    content: current.content + ev.deltaContent,
                };
                bufferRef.current = next;
                setStreaming(next);
            }
        });

        const offDone = window.chatAPI.onStreamDone((ev) => {
            if (ev.sessionId !== sessionId) return;
            bufferRef.current = null;
            setStreaming(null);
            setPendingUser(null);
            // Hydrate the history cache with the final message so React re-renders
            // from the canonical store, not the transient stream buffer.
            qc.setQueryData(sessionDetailKey(sessionId), (prev: typeof detail.data) => {
                if (!prev) return prev;
                if (prev.messages.some((m) => m.id === ev.messageId)) return prev;
                const next: ChatMessage = {
                    id: ev.messageId,
                    role: "assistant",
                    content: ev.content,
                    timestamp: new Date().toISOString(),
                };
                return { ...prev, messages: [...prev.messages, next] };
            });
        });

        const offReasoningDelta = window.chatAPI.onReasoningDelta((ev) => {
            if (ev.sessionId !== sessionId) return;
            if (abortRequestedRef.current) return;
            const current = reasoningRef.current;
            const next: ReasoningState = current
                ? { ...current, text: current.text + ev.deltaContent }
                : { text: ev.deltaContent, startedAt: Date.now(), completedAt: null };
            reasoningRef.current = next;
            setReasoning(next);
        });

        const offReasoningDone = window.chatAPI.onReasoningDone((ev) => {
            if (ev.sessionId !== sessionId) return;
            const current = reasoningRef.current ?? {
                text: "",
                startedAt: Date.now(),
                completedAt: null,
            };
            const next: ReasoningState = {
                text: ev.content || current.text,
                startedAt: current.startedAt,
                completedAt: Date.now(),
            };
            reasoningRef.current = next;
            setReasoning(next);
        });

        const offToolStart = window.chatAPI.onToolStart((ev) => {
            if (ev.sessionId !== sessionId) return;
            if (abortRequestedRef.current) return;
            setToolStatuses((prev) => {
                if (prev.some((t) => t.id === ev.toolCallId)) return prev;
                const tool: ToolStatus = {
                    id: ev.toolCallId,
                    name: ev.toolName,
                    description: ev.description,
                    running: true,
                };
                return [...prev, tool];
            });
        });

        const offToolProgress = window.chatAPI.onToolProgress((ev) => {
            if (ev.sessionId !== sessionId) return;
            setToolStatuses((prev) =>
                prev.map((t) =>
                    t.id === ev.toolCallId ? { ...t, progress: ev.progressMessage } : t,
                ),
            );
        });

        const offToolComplete = window.chatAPI.onToolComplete((ev) => {
            if (ev.sessionId !== sessionId) return;
            setToolStatuses((prev) =>
                prev.map((t) =>
                    t.id === ev.toolCallId
                        ? {
                            ...t,
                            running: false,
                            ...(ev.success ? {} : { description: ev.errorMessage ?? t.description }),
                        }
                        : t,
                ),
            );
        });

        const offTurnStart = window.chatAPI.onTurnStart((ev) => {
            if (ev.sessionId !== sessionId) return;
            if (abortRequestedRef.current) return;
            // Fresh turn → clear stale reasoning / tools from the previous one.
            reasoningRef.current = null;
            setReasoning(null);
            setToolStatuses([]);
            setIsBusy(true);
        });

        const offTurnEnd = window.chatAPI.onTurnEnd((ev) => {
            if (ev.sessionId !== sessionId) return;
            // Keep `isBusy` true until `session.idle` — the SDK may run another
            // turn (e.g. tool follow-ups) before fully idling.
            const current = reasoningRef.current;
            if (current && current.completedAt === null) {
                const next: ReasoningState = { ...current, completedAt: Date.now() };
                reasoningRef.current = next;
                setReasoning(next);
            }
        });

        const offIdle = window.chatAPI.onIdle((ev) => {
            if (ev.sessionId !== sessionId) return;
            bufferRef.current = null;
            reasoningRef.current = null;
            setStreaming(null);
            setPendingUser(null);
            setReasoning(null);
            setToolStatuses([]);
            setIsBusy(false);
            // Abort acknowledged (or natural idle) — re-allow events for the next turn.
            abortRequestedRef.current = false;
            // Pull fresh history (covers tool turns or anything we didn't fold into
            // the cache via `onStreamDone`).
            void qc.invalidateQueries({ queryKey: sessionDetailKey(sessionId) });
        });

        const offError = window.chatAPI.onError((ev) => {
            if (ev.sessionId !== sessionId) return;
            setError(ev.message);
            setIsBusy(false);
        });

        return () => {
            offDelta();
            offDone();
            offReasoningDelta();
            offReasoningDone();
            offToolStart();
            offToolProgress();
            offToolComplete();
            offTurnStart();
            offTurnEnd();
            offIdle();
            offError();
        };
    }, [sessionId, qc]);

    const sendMutation = useMutation<void, Error, { prompt: string; attachments?: ChatAttachment[] }>({
        mutationFn: async ({ prompt, attachments }) => {
            if (!sessionId) throw new Error("no session open");
            const optimistic: ChatMessage = {
                id: `local-${Date.now()}`,
                role: "user",
                content: prompt,
                timestamp: new Date().toISOString(),
            };
            // New turn starts — re-allow SDK events that may have been suppressed
            // after a prior abort.
            abortRequestedRef.current = false;
            setPendingUser(optimistic);
            // Flip busy synchronously so the stop button + processing indicator
            // appear without waiting for the first IPC event.
            setIsBusy(true);
            setError(null);
            await window.chatAPI.send(sessionId, prompt, attachments);
        },
        onError: (err) => {
            setPendingUser(null);
            setIsBusy(false);
            setError(err.message);
        },
    });

    const abortMutation = useMutation<void, Error, void>({
        mutationFn: async () => {
            if (!sessionId) return;
            await window.chatAPI.abort(sessionId);
        },
    });

    const send = useCallback(
        async (prompt: string, attachments?: ChatAttachment[]) => {
            await sendMutation.mutateAsync({ prompt, attachments });
        },
        [sendMutation],
    );

    const abort = useCallback(async () => {
        if (!sessionId) return;
        // Optimistically reset the renderer's streaming state so the composer
        // re-enables immediately. The SDK *should* eventually emit `session.idle`
        // (which is idempotent on this state), but we can't depend on it — if
        // abort races with end-of-turn or the SDK swallows the idle, the input
        // would otherwise stay disabled forever.
        abortRequestedRef.current = true;
        bufferRef.current = null;
        reasoningRef.current = null;
        setStreaming(null);
        setPendingUser(null);
        setReasoning(null);
        setToolStatuses([]);
        setIsBusy(false);
        // The SDK's `session.send()` doesn't resolve until the response
        // completes (or aborts), so `sendMutation.isPending` can stay `true`
        // long after the user clicked Stop. Reset the mutation state so the
        // composer doesn't observe a stale pending flag if a consumer ever
        // reintroduces it into the disabled-condition.
        sendMutation.reset();
        try {
            await abortMutation.mutateAsync();
        } catch (err) {
            // Surface but don't re-disable the UI; the user already wanted to stop.
            setError(err instanceof Error ? err.message : String(err));
        }
        // Refresh history from the canonical store (covers any partial turn the
        // SDK persisted before acknowledging the abort).
        void qc.invalidateQueries({ queryKey: sessionDetailKey(sessionId) });
    }, [sessionId, abortMutation, sendMutation, qc]);

    const messages = useMemo<ChatMessage[]>(() => {
        const history = detail.data?.messages ?? [];
        const merged: ChatMessage[] = [...history];
        if (pendingUser && !history.some((m) => m.content === pendingUser.content && m.role === "user")) {
            merged.push(pendingUser);
        }
        if (streaming) {
            merged.push({
                id: streaming.messageId,
                role: "assistant",
                content: streaming.content,
                timestamp: streaming.startedAt,
            });
        }
        return merged;
    }, [detail.data, pendingUser, streaming]);

    return {
        messages,
        isBusy,
        // NOTE: `sendMutation.isPending` is intentionally NOT folded in here.
        // The SDK's `session.send()` promise can stay pending for the entire
        // turn (and forever if the SDK hangs without firing `idle`), which
        // would lock the composer indefinitely after the user clicks Stop.
        // `isBusy` is set synchronously inside `sendMutation.mutationFn`
        // before the IPC await, so the "just-clicked-Send, no events yet"
        // window is already covered.
        isStreaming: isBusy || streaming !== null,
        reasoning,
        toolStatuses,
        error,
        send,
        abort,
        isLoading: detail.isLoading,
    };
}
