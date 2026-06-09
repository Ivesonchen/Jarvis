import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { ChatAttachment } from "@common/ipc-contract";

import { useAuth } from "@/features/auth/useAuth";
import ChatPanel from "@/features/chat/ChatPanel";
import Composer, { type PendingComposerFile } from "@/features/home/Composer";
import WelcomeScreen from "@/features/home/WelcomeScreen";
import { useCreateSession } from "@/features/sessions/useSessions";
import SettingsDialog from "@/features/settings/SettingsDialog";
import Sidebar from "@/shell/Sidebar";
import TitleBar from "@/shell/TitleBar";

/**
 * Top-level shell:
 *   ┌────────────────────────────────────────────┐
 *   │  TitleBar (frameless drag region)          │
 *   ├──────────┬─────────────────────────────────┤
 *   │ Sidebar  │  Main: ChatPanel | WelcomeScreen│
 *   │          │                                 │
 *   │          │  (welcome state shows Composer  │
 *   │          │   at the bottom; ChatPanel      │
 *   │          │   keeps its own input)          │
 *   └──────────┴─────────────────────────────────┘
 *
 * The sidebar can be collapsed from the title bar's panel-left icon. When
 * the user submits from the welcome composer, we create a new session,
 * navigate to it, and hand the prompt to ChatPanel via the `pendingPrompt`
 * prop. ChatPanel sends it from its own effect so the IPC stream
 * subscription is already in place when the SDK starts emitting.
 *
 * Image attachments staged on the welcome composer are persisted under the
 * newly-created session id and forwarded the same way via `pendingAttachments`.
 */
export default function HomePage() {
    const navigate = useNavigate();
    const params = useParams<{ sessionId?: string }>();
    const { data: auth } = useAuth();
    const createSession = useCreateSession();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    /** sessionId → prompt to send on first mount of ChatPanel for that session. */
    const [pendingPrompts, setPendingPrompts] = useState<Record<string, string>>({});
    /** sessionId → image attachments seeded from the welcome composer. */
    const [pendingAttachments, setPendingAttachments] = useState<
        Record<string, ChatAttachment[]>
    >({});

    // Tray "Settings…" entry asks the renderer to open this dialog.
    useEffect(() => {
        return window.settingsAPI.onOpenRequested(() => setSettingsOpen(true));
    }, []);

    /** Spin up a new session, navigate to it, and seed the first prompt. */
    const startWithPrompt = async (
        prompt: string,
        files: PendingComposerFile[] = [],
    ): Promise<void> => {
        try {
            const session = await createSession.mutateAsync();
            // Persist any staged images under the new session's attachments dir.
            const saved: ChatAttachment[] = [];
            for (const f of files) {
                try {
                    const { attachment } = await window.attachmentsAPI.saveImage(
                        session.sessionId,
                        f.base64,
                        f.mimeType,
                    );
                    saved.push({ ...attachment, displayName: f.displayName });
                } catch {
                    // Skip this file; the rest still go through.
                }
                URL.revokeObjectURL(f.previewUrl);
            }
            setPendingPrompts((m) => ({ ...m, [session.sessionId]: prompt }));
            if (saved.length > 0) {
                setPendingAttachments((m) => ({ ...m, [session.sessionId]: saved }));
            }
            navigate(`/chat/${session.sessionId}`);
        } catch {
            // Failure is surfaced inside ChatPanel via the chat:error event
            // bridge — nothing else to do at this layer.
        }
    };

    const handleWelcomeSubmit = (text: string, files: PendingComposerFile[]): void => {
        void startWithPrompt(text, files);
    };

    const clearPendingFor = useCallback((sid: string) => {
        setPendingPrompts((m) => {
            if (!(sid in m)) return m;
            const next = { ...m };
            delete next[sid];
            return next;
        });
        setPendingAttachments((m) => {
            if (!(sid in m)) return m;
            const next = { ...m };
            delete next[sid];
            return next;
        });
    }, []);

    return (
        <div className="flex h-full w-full flex-col bg-(--background)">
            <TitleBar onToggleSidebar={() => setSidebarOpen((v) => !v)} />

            <div className="flex min-h-0 flex-1">
                {sidebarOpen && <Sidebar onOpenSettings={() => setSettingsOpen(true)} />}

                <main className="flex min-w-0 flex-1 flex-col">
                    {params.sessionId ? (
                        <ChatPanel
                            sessionId={params.sessionId}
                            pendingPrompt={pendingPrompts[params.sessionId]}
                            pendingAttachments={pendingAttachments[params.sessionId]}
                            onPendingPromptConsumed={() => clearPendingFor(params.sessionId!)}
                        />
                    ) : (
                        <>
                            <WelcomeScreen username={auth?.username} />
                            <div className="border-t border-(--border) bg-(--background) px-6 py-3">
                                <Composer
                                    placeholder="Describe what you want to do"
                                    disabled={createSession.isPending}
                                    onSubmit={handleWelcomeSubmit}
                                />
                            </div>
                        </>
                    )}
                </main>
            </div>

            <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        </div>
    );
}

