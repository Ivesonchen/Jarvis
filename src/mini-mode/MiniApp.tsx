import { useEffect, useRef, useState } from "react";

/**
 * Mini-mode quick-prompt window.
 *
 * Single textarea: Enter sends the prompt to the most-recent session
 * (creating one if none exists), then closes. Esc closes without sending.
 * Designed for global-hotkey-driven "drop a question and forget it"
 * workflows — the full conversation continues in the main window.
 */
export default function MiniApp(): React.ReactElement {
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") void window.miniModeAPI.close();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const submit = async (): Promise<void> => {
        const trimmed = text.trim();
        if (!trimmed || sending) return;
        setSending(true);
        setError(null);
        try {
            await window.miniModeAPI.sendQuick(trimmed);
            setText("");
            await window.miniModeAPI.close();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setSending(false);
        }
    };

    return (
        <div className="flex h-screen w-screen flex-col gap-2 rounded-lg border border-(--border) bg-(--card) p-4 shadow-2xl">
            <div className="text-xs text-(--muted-foreground)">Javis — Quick Ask (Esc to close)</div>
            <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submit();
                    }
                }}
                placeholder="Ask Javis anything…"
                disabled={sending}
                className="flex-1 resize-none rounded border border-(--border) bg-(--background) p-2 text-sm focus:outline-none focus:ring-1 focus:ring-(--ring)"
            />
            {error && <div className="text-xs text-(--destructive)">{error}</div>}
            <div className="flex items-center justify-between text-xs text-(--muted-foreground)">
                <span>Enter to send · Shift+Enter for newline</span>
                <span>{sending ? "Sending…" : `${text.length} chars`}</span>
            </div>
        </div>
    );
}
