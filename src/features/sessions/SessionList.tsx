import { Plus, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
    useCreateSession,
    useDeleteSession,
    useSessions,
} from "@/features/sessions/useSessions";
import { cn } from "@/lib/utils";

export default function SessionList() {
    const navigate = useNavigate();
    const params = useParams<{ sessionId?: string }>();
    const activeId = params.sessionId;
    const { data: sessions = [], isLoading } = useSessions();
    const create = useCreateSession();
    const del = useDeleteSession();

    const handleCreate = async (): Promise<void> => {
        try {
            const session = await create.mutateAsync();
            navigate(`/chat/${session.sessionId}`);
        } catch {
            // Surface via banner later; for now keep silent.
        }
    };

    const handleDelete = async (sessionId: string): Promise<void> => {
        if (!confirm("Delete this chat permanently?")) return;
        try {
            await del.mutateAsync(sessionId);
            if (activeId === sessionId) {
                navigate("/chat");
            }
        } catch {
            // ignored
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="px-3 pt-3">
                <Button
                    variant="default"
                    className="w-full"
                    onClick={() => void handleCreate()}
                    disabled={create.isPending}
                >
                    <Plus className="h-4 w-4" />
                    New chat
                </Button>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto px-2 pb-3">
                {isLoading ? (
                    <div className="px-2 py-2 text-xs text-(--muted-foreground)">Loading…</div>
                ) : sessions.length === 0 ? (
                    <div className="px-2 py-4 text-xs text-(--muted-foreground)">
                        No chats yet. Click <span className="font-medium">New chat</span> to begin.
                    </div>
                ) : (
                    <ul className="flex flex-col gap-0.5">
                        {sessions.map((s) => {
                            const isActive = activeId === s.sessionId;
                            return (
                                <li key={s.sessionId}>
                                    <div
                                        className={cn(
                                            "group flex items-center rounded-md px-2 py-1.5 text-sm transition-colors",
                                            isActive
                                                ? "bg-(--accent) text-(--accent-foreground)"
                                                : "hover:bg-(--accent)/60",
                                        )}
                                    >
                                        <button
                                            className="flex-1 truncate text-left"
                                            onClick={() => navigate(`/chat/${s.sessionId}`)}
                                            title={s.title}
                                        >
                                            {s.title || "Untitled"}
                                        </button>
                                        <button
                                            className="ml-2 hidden h-6 w-6 items-center justify-center rounded text-(--muted-foreground) hover:bg-(--destructive)/10 hover:text-(--destructive) group-hover:flex"
                                            onClick={() => void handleDelete(s.sessionId)}
                                            title="Delete"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
