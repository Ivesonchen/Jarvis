/**
 * Inline indicator shown while a turn is in flight. Mirrors CatClaw's
 * `StreamingMessage` essentials: a "Processing" shimmer when nothing else
 * is happening, a collapsible reasoning block (Thinking… / Thought for Xs),
 * and a collapsible tool-status list.
 */
import { Brain, ChevronDown, Loader2, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ToolStatus } from "@common/ipc-contract";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ReasoningState } from "./useChat";

interface Props {
    isBusy: boolean;
    /** Whether the streaming bubble below already shows a partial assistant message. */
    hasAssistantText: boolean;
    reasoning: ReasoningState | null;
    toolStatuses: ToolStatus[];
}

export default function StreamingIndicator({
    isBusy,
    hasAssistantText,
    reasoning,
    toolStatuses,
}: Props) {
    if (!isBusy) return null;
    const hasReasoning = (reasoning?.text?.length ?? 0) > 0;
    const hasTools = toolStatuses.length > 0;

    // Show the bare "Processing" shimmer only when there's nothing else
    // moving on screen yet.
    const showProcessing = !hasReasoning && !hasTools && !hasAssistantText;

    return (
        <div className="flex w-full max-w-[min(720px,85%)] flex-col gap-2 self-start rounded-2xl bg-(--muted)/40 px-4 py-3 text-sm">
            {showProcessing && <ProcessingShimmer />}
            {hasReasoning && reasoning && <ReasoningBlock reasoning={reasoning} />}
            {hasTools && <ToolList toolStatuses={toolStatuses} />}
        </div>
    );
}

function ProcessingShimmer() {
    return (
        <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-(--muted-foreground)" />
            <span
                className={cn(
                    "bg-linear-to-r from-(--muted-foreground) via-(--foreground) to-(--muted-foreground)",
                    "bg-[length:200%_100%] bg-clip-text text-transparent",
                    "animate-[shimmer_2s_linear_infinite]",
                )}
            >
                Processing…
            </span>
        </div>
    );
}

function ReasoningBlock({ reasoning }: { reasoning: ReasoningState }) {
    // Live ticking duration while thinking is still in-flight.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (reasoning.completedAt !== null) return;
        const id = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(id);
    }, [reasoning.completedAt]);

    const endTime = reasoning.completedAt ?? now;
    const elapsed = Math.max(0, Math.round((endTime - reasoning.startedAt) / 1000));
    const isDone = reasoning.completedAt !== null;
    const label = isDone
        ? `Thought for ${formatDuration(elapsed)}`
        : `Thinking${dots(now)}`;

    const [open, setOpen] = useState(true);

    return (
        <div className="flex flex-col gap-1.5">
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen((v) => !v)}
                className="h-7 w-fit gap-1.5 px-2 text-xs text-(--muted-foreground) hover:bg-(--accent)/60"
            >
                <Brain className="h-3.5 w-3.5" />
                <span>{label}</span>
                <ChevronDown
                    className={cn("h-3 w-3 transition-transform", open ? "" : "-rotate-90")}
                />
            </Button>
            {open && (
                <div className="prose-chat max-h-72 overflow-y-auto rounded-lg border border-(--border)/50 bg-(--background)/40 px-3 py-2 text-xs leading-relaxed text-(--muted-foreground)">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{ img: () => null }}
                    >
                        {reasoning.text}
                    </ReactMarkdown>
                </div>
            )}
        </div>
    );
}

function ToolList({ toolStatuses }: { toolStatuses: ToolStatus[] }) {
    const [open, setOpen] = useState(true);
    const running = toolStatuses.filter((t) => t.running);
    const completed = toolStatuses.filter((t) => !t.running);
    const summary = useMemo(() => {
        if (running.length > 0) {
            return running.length === 1
                ? "Running 1 tool…"
                : `Running ${running.length} tools…`;
        }
        return completed.length === 1
            ? "Used 1 tool"
            : `Used ${completed.length} tools`;
    }, [running.length, completed.length]);

    return (
        <div className="flex flex-col gap-1.5">
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen((v) => !v)}
                className="h-7 w-fit gap-1.5 px-2 text-xs text-(--muted-foreground) hover:bg-(--accent)/60"
            >
                <Wrench className="h-3.5 w-3.5" />
                <span>{summary}</span>
                <ChevronDown
                    className={cn("h-3 w-3 transition-transform", open ? "" : "-rotate-90")}
                />
            </Button>
            {open && (
                <ul className="flex flex-col gap-1 rounded-lg border border-(--border)/50 bg-(--background)/40 px-3 py-2">
                    {toolStatuses.map((t) => (
                        <li
                            key={t.id}
                            className="flex items-start gap-2 text-xs text-(--muted-foreground)"
                        >
                            {t.running ? (
                                <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-(--primary)" />
                            ) : (
                                <Wrench className="mt-0.5 h-3 w-3 shrink-0 text-(--muted-foreground)" />
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="truncate font-mono text-[11px] text-(--foreground)">
                                    {t.description}
                                </div>
                                {t.progress && (
                                    <div className="truncate text-[10px] opacity-70">{t.progress}</div>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
}

function dots(now: number): string {
    const phase = Math.floor(now / 500) % 4;
    return ".".repeat(phase);
}
