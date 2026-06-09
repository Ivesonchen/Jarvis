import {
    MessageSquarePlus,
    MoreHorizontal,
    Search,
    Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth, useSignOut } from "@/features/auth/useAuth";
import {
    useCreateSession,
    useDeleteSession,
    useSessions,
} from "@/features/sessions/useSessions";
import { cn } from "@/lib/utils";

interface Props {
    onOpenSettings: () => void;
}

/**
 * Left sidebar:
 *   • Top: "New chat"
 *   • Middle: "Chats" header + search input, optional sign-in nudge banner,
 *     scrollable list of session titles, "Clear all chats" footer
 *   • Bottom: user profile pill with overflow menu (opens Settings)
 */
export default function Sidebar({ onOpenSettings }: Props) {
    const navigate = useNavigate();
    const params = useParams<{ sessionId?: string }>();
    const activeId = params.sessionId;
    const { data: sessions = [], isLoading } = useSessions();
    const { data: auth } = useAuth();
    const signOut = useSignOut();
    const create = useCreateSession();
    const del = useDeleteSession();
    const [query, setQuery] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);

    const filteredSessions = useMemo(() => {
        if (!query.trim()) return sessions;
        const q = query.trim().toLowerCase();
        return sessions.filter((s) => (s.title || "").toLowerCase().includes(q));
    }, [sessions, query]);

    const handleCreate = async (): Promise<void> => {
        try {
            const session = await create.mutateAsync();
            navigate(`/chat/${session.sessionId}`);
        } catch {
            // surfaced elsewhere
        }
    };

    const handleDelete = async (sessionId: string): Promise<void> => {
        if (!confirm("Delete this chat permanently?")) return;
        try {
            await del.mutateAsync(sessionId);
            if (activeId === sessionId) navigate("/chat");
        } catch {
            // ignored
        }
    };

    const handleClearAll = async (): Promise<void> => {
        if (sessions.length === 0) return;
        if (!confirm(`Delete all ${sessions.length} chats permanently?`)) return;
        // Sequential to keep the index file consistent; the count is small.
        for (const s of sessions) {
            try {
                await del.mutateAsync(s.sessionId);
            } catch {
                /* keep going */
            }
        }
        navigate("/chat");
    };

    const handleSignOut = async (): Promise<void> => {
        await signOut.mutateAsync();
        navigate("/signin", { replace: true });
    };

    return (
        <aside className="flex h-full w-64 shrink-0 flex-col border-r border-(--border) bg-(--background)">
            {/* ── Top nav ─────────────────────────────────────────────── */}
            <div className="flex flex-col gap-0.5 px-3 pt-3 pb-2">
                <NavItem
                    icon={<MessageSquarePlus className="h-4 w-4" />}
                    label="New chat"
                    onClick={() => void handleCreate()}
                    disabled={create.isPending}
                />
            </div>

            {/* ── Chats header + search ───────────────────────────────── */}
            <div className="flex items-center justify-between px-4 pt-1 pb-1">
                <span className="text-xs font-medium text-(--muted-foreground)">Chats</span>
                <button
                    className="flex h-6 w-6 items-center justify-center rounded text-(--muted-foreground) hover:bg-(--accent) hover:text-(--foreground)"
                    onClick={() => setSearchOpen((v) => !v)}
                    title="Search chats"
                >
                    <Search className="h-3.5 w-3.5" />
                </button>
            </div>
            {searchOpen && (
                <div className="px-3 pb-2">
                    <input
                        autoFocus
                        type="text"
                        placeholder="Search…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-full rounded-md border border-(--border) bg-(--background) px-2 py-1 text-xs outline-none focus:border-(--ring)"
                    />
                </div>
            )}

            {/* ── Sign-in nudge banner (only when signed out / not auth'd) ── */}
            {!auth?.authenticated && (
                <div className="mx-3 mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                    <div className="mb-2 text-xs leading-tight text-amber-200">
                        Sessions and memories aren&apos;t being saved — sign in to GitHub Copilot
                    </div>
                    <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
                        onClick={() => navigate("/signin")}
                    >
                        Sign in
                    </Button>
                </div>
            )}

            {/* ── Scrollable chat list ────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-2">
                {isLoading ? (
                    <div className="px-3 py-2 text-xs text-(--muted-foreground)">Loading…</div>
                ) : filteredSessions.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-(--muted-foreground)">
                        {query ? "No matches." : "No chats yet."}
                    </div>
                ) : (
                    <ul className="flex flex-col">
                        {filteredSessions.map((s) => {
                            const isActive = activeId === s.sessionId;
                            return (
                                <li key={s.sessionId}>
                                    <div
                                        className={cn(
                                            "group flex items-center rounded-md px-2 py-1.5 text-sm transition-colors",
                                            isActive
                                                ? "bg-(--accent) text-(--accent-foreground)"
                                                : "text-(--foreground)/85 hover:bg-(--accent)/50",
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
                                            className="ml-1 hidden h-6 w-6 items-center justify-center rounded text-(--muted-foreground) hover:bg-(--destructive)/10 hover:text-(--destructive) group-hover:flex"
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

            {/* ── Clear all chats footer (only when there are chats) ── */}
            {sessions.length > 0 && (
                <button
                    className="mx-2 mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-xs text-(--muted-foreground) hover:bg-(--accent) hover:text-(--foreground)"
                    onClick={() => void handleClearAll()}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear all chats
                </button>
            )}

            {/* ── User profile pill ───────────────────────────────────── */}
            <div className="flex items-center gap-2 border-t border-(--border) bg-(--background) px-2 py-2">
                <div className="flex flex-1 items-center gap-2 rounded-md px-1.5 py-1">
                    <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-(--secondary) text-xs font-semibold uppercase">
                        {(auth?.username ?? "?").slice(0, 1)}
                        {/* Status dot — red if signed out, green if signed in. */}
                        <span
                            className={cn(
                                "absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-(--background)",
                                auth?.authenticated ? "bg-emerald-500" : "bg-red-500",
                            )}
                        />
                    </div>
                    <div className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate text-xs font-medium">
                            {auth?.username ?? "Signed out"}
                        </span>
                        <span className="truncate text-[10px] text-(--muted-foreground)">
                            {auth?.authenticated
                                ? auth.copilotPlan
                                    ? `Copilot · ${auth.copilotPlan}`
                                    : "Signed in"
                                : "Not signed in"}
                        </span>
                    </div>
                </div>
                <button
                    className="flex h-7 w-7 items-center justify-center rounded-md text-(--muted-foreground) hover:bg-(--accent) hover:text-(--foreground)"
                    onClick={onOpenSettings}
                    title="Settings"
                >
                    <MoreHorizontal className="h-4 w-4" />
                </button>
                {auth?.authenticated && (
                    <button
                        className="text-[10px] text-(--muted-foreground) hover:text-(--foreground)"
                        onClick={() => void handleSignOut()}
                        disabled={signOut.isPending}
                        title="Sign out"
                    >
                        Sign out
                    </button>
                )}
            </div>
        </aside>
    );
}

interface NavItemProps {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    title?: string;
}

function NavItem({ icon, label, onClick, disabled, title }: NavItemProps) {
    return (
        <button
            className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                disabled
                    ? "cursor-default text-(--muted-foreground)/60"
                    : "text-(--foreground)/90 hover:bg-(--accent)",
            )}
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            title={title ?? label}
        >
            <span className="text-(--muted-foreground)">{icon}</span>
            <span>{label}</span>
        </button>
    );
}
