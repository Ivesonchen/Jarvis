import { AlertTriangle, ShieldCheck, ShieldQuestion } from "lucide-react";

import type { PermissionCard as Card } from "@common/ipc-contract";

import { Button } from "@/components/ui/button";
import { usePendingPermissions, useRespondToPermission } from "@/features/permissions/usePermissions";

interface Props {
    sessionId: string;
}

const KIND_LABEL: Record<Card["kind"], string> = {
    shell: "Shell",
    write: "Write",
    read: "Read",
    mcp: "MCP tool",
    "custom-tool": "Tool",
    url: "Fetch",
    memory: "Memory",
    hook: "Hook",
    other: "Permission",
};

export default function PermissionCards({ sessionId }: Props) {
    const { data: cards = [] } = usePendingPermissions(sessionId);
    const respond = useRespondToPermission(sessionId);

    if (cards.length === 0) return null;

    return (
        <div className="space-y-2 px-4 py-3">
            {cards.map((card) => (
                <PermissionCardRow
                    key={card.requestId}
                    card={card}
                    pending={respond.isPending}
                    onRespond={(action) => respond.mutate({ requestId: card.requestId, action })}
                />
            ))}
        </div>
    );
}

interface RowProps {
    card: Card;
    pending: boolean;
    onRespond: (action: "allow" | "allow-session" | "allow-always" | "deny") => void;
}

function PermissionCardRow({ card, pending, onRespond }: RowProps) {
    return (
        <div className="rounded-lg border border-(--border) bg-(--card) p-3 text-sm">
            <div className="mb-2 flex items-start gap-2">
                <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-(--primary)" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-medium">{card.title}</span>
                        <span className="rounded bg-(--secondary) px-1.5 py-0.5 text-xs uppercase tracking-wide text-(--muted-foreground)">
                            {KIND_LABEL[card.kind]}
                        </span>
                    </div>
                    {card.summary && (
                        <div className="mt-1 text-xs text-(--muted-foreground)">{card.summary}</div>
                    )}
                </div>
            </div>

            <pre className="mb-2 max-h-32 overflow-auto rounded bg-(--secondary)/40 p-2 text-xs">
                <code>{card.detail}</code>
            </pre>

            {card.warning && (
                <div className="mb-2 flex items-start gap-2 rounded border border-(--destructive)/30 bg-(--destructive)/10 px-2 py-1.5 text-xs text-(--destructive)">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{card.warning}</span>
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={pending} onClick={() => onRespond("allow")}>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Allow once
                </Button>
                {card.canOfferSessionApproval && (
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => onRespond("allow-session")}
                    >
                        Allow for session
                    </Button>
                )}
                <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => onRespond("allow-always")}
                >
                    Always allow
                </Button>
                <Button
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => onRespond("deny")}
                >
                    Deny
                </Button>
            </div>
        </div>
    );
}
