import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import type { ChatMessage } from "@common/ipc-contract";

import CodeBlock from "@/features/chat/CodeBlock";
import { cn } from "@/lib/utils";

interface Props {
    message: ChatMessage;
    isStreaming?: boolean;
}

/** Extract a plain string from a hast/jsx tree (for the copy button). */
function nodeToString(node: React.ReactNode): string {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(nodeToString).join("");
    if (typeof node === "object" && "props" in node) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return nodeToString((node as any).props?.children);
    }
    return "";
}

export default function MessageBubble({ message, isStreaming }: Props) {
    const isUser = message.role === "user";
    return (
        <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
            <div
                className={cn(
                    "max-w-[min(720px,85%)] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    isUser
                        ? "bg-(--primary) text-(--primary-foreground)"
                        : "bg-(--muted) text-(--foreground)",
                )}
            >
                {isUser ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                ) : (
                    <div className="prose-chat">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
                            components={{
                                // Block external image loads — defensive against prompt-injected content.
                                img: () => null,
                                // Open links in the user's default browser, not the renderer.
                                a: ({ href, children }) => (
                                    <a
                                        href={href}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (href) void window.appAPI.openExternal(href);
                                        }}
                                        className="text-(--primary) underline-offset-2 hover:underline"
                                    >
                                        {children}
                                    </a>
                                ),
                                // Fenced code blocks are wrapped in <pre><code>…</code></pre>.
                                // `react-markdown` passes the `<code>` child up; we render
                                // it ourselves as a <CodeBlock>. Inline `code` stays inline.
                                code: ({ className, children, ...rest }) => {
                                    const match = /language-(\w+)/.exec(className ?? "");
                                    const isBlock =
                                        !!match || nodeToString(children).includes("\n");
                                    if (!isBlock) {
                                        return (
                                            <code className={className} {...rest}>
                                                {children}
                                            </code>
                                        );
                                    }
                                    return (
                                        <CodeBlock
                                            code={nodeToString(children).replace(/\n$/, "")}
                                            language={match?.[1]}
                                            className={className}
                                        >
                                            {children}
                                        </CodeBlock>
                                    );
                                },
                                // The wrapping <pre> is replaced by <CodeBlock>'s own <pre>,
                                // so collapse it here to avoid nested <pre> tags.
                                pre: ({ children }) => <>{children}</>,
                            }}
                        >
                            {message.content}
                        </ReactMarkdown>
                        {isStreaming && (
                            <span className="inline-block h-3 w-2 animate-pulse bg-(--foreground) align-middle" />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
