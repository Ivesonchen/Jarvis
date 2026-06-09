import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface Props {
    /** Source code as a single string. */
    code: string;
    /** Inferred language from the markdown fence (e.g. "ts", "python"). */
    language?: string;
    /** Already-highlighted hast children from rehype-highlight. */
    children?: React.ReactNode;
    className?: string;
}

/**
 * Fenced-code-block renderer used by `<ReactMarkdown>` in MessageBubble.
 * Shows the language label + a copy button on hover; the syntax-highlighted
 * tokens (produced upstream by rehype-highlight) are rendered as-is.
 */
export default function CodeBlock({ code, language, children, className }: Props) {
    const [copied, setCopied] = useState(false);

    const handleCopy = (): void => {
        void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <div className="group relative my-3 overflow-hidden rounded-md border border-(--border) bg-(--secondary)">
            <div className="flex items-center justify-between border-b border-(--border) px-3 py-1 text-[10px] uppercase tracking-wide text-(--muted-foreground)">
                <span>{language || "text"}</span>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-(--muted-foreground) opacity-0 transition group-hover:opacity-100 hover:bg-(--accent) hover:text-(--foreground)"
                    title={copied ? "Copied" : "Copy code"}
                    aria-label={copied ? "Copied" : "Copy code"}
                >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                </button>
            </div>
            <pre className={cn("m-0 overflow-x-auto px-4 py-3 text-[13px] leading-6", className)}>
                <code className={cn("hljs bg-transparent p-0", className)}>{children ?? code}</code>
            </pre>
        </div>
    );
}
