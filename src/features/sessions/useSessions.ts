/**
 * React Query hooks for the sessions list + mutations.
 *
 * The renderer doesn't poll for changes — instead `useSessionsEventBridge`
 * (mounted once at the app root) listens for `sessions:changed` IPC events
 * and invalidates the query so the list refetches.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { SessionDetail, SessionSummary } from "@common/ipc-contract";

export const SESSIONS_QUERY_KEY = ["sessions"] as const;

export function sessionDetailKey(sessionId: string) {
    return ["sessions", "detail", sessionId] as const;
}

export function useSessions() {
    return useQuery<SessionSummary[]>({
        queryKey: SESSIONS_QUERY_KEY,
        queryFn: async () => {
            const { sessions } = await window.sessionsAPI.list();
            return sessions;
        },
        staleTime: 5_000,
    });
}

export function useSessionDetail(sessionId: string | undefined) {
    return useQuery<SessionDetail>({
        queryKey: sessionId ? sessionDetailKey(sessionId) : ["sessions", "detail", "_none"],
        enabled: !!sessionId,
        queryFn: async () => {
            const { detail } = await window.sessionsAPI.open(sessionId as string);
            return detail;
        },
        // The chat stream is event-driven, not query-driven, so we don't refetch
        // on every focus — that would clobber an in-flight assistant message.
        staleTime: Infinity,
        refetchOnWindowFocus: false,
    });
}

export function useCreateSession() {
    const qc = useQueryClient();
    return useMutation<SessionSummary, Error, void>({
        mutationFn: async () => {
            const { session } = await window.sessionsAPI.create();
            return session;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
        },
    });
}

export function useDeleteSession() {
    const qc = useQueryClient();
    return useMutation<void, Error, string>({
        mutationFn: (sessionId) => window.sessionsAPI.delete(sessionId),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
        },
    });
}

export function useRenameSession() {
    const qc = useQueryClient();
    return useMutation<void, Error, { sessionId: string; title: string }>({
        mutationFn: ({ sessionId, title }) => window.sessionsAPI.rename(sessionId, title),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
        },
    });
}

/** Mount once at app root — refreshes the list when the backend tells us to. */
export function useSessionsEventBridge(): void {
    const qc = useQueryClient();
    useEffect(() => {
        const off = window.sessionsAPI.onChanged(() => {
            void qc.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
        });
        return off;
    }, [qc]);
}
