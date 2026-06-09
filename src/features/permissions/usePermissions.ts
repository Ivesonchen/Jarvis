import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { PermissionCard, PermissionResponseAction } from "@common/ipc-contract";

export const permissionsQueryKey = (sessionId: string | undefined) => ["permissions", sessionId ?? "__all__"] as const;

export function usePendingPermissions(sessionId: string | undefined) {
    return useQuery<PermissionCard[]>({
        queryKey: permissionsQueryKey(sessionId),
        queryFn: async () => {
            const { cards } = await window.permissionsAPI.list(sessionId);
            return cards;
        },
        enabled: !!sessionId,
        staleTime: Infinity,
    });
}

export function useRespondToPermission(sessionId: string | undefined) {
    const qc = useQueryClient();
    return useMutation<void, Error, { requestId: string; action: PermissionResponseAction }>({
        mutationFn: async ({ requestId, action }) => {
            await window.permissionsAPI.respond(requestId, action);
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: permissionsQueryKey(sessionId) });
        },
    });
}

export function usePermissionsEventBridge(): void {
    const qc = useQueryClient();
    useEffect(() => {
        const off = window.permissionsAPI.onChanged(({ sessionId }) => {
            void qc.invalidateQueries({ queryKey: permissionsQueryKey(sessionId) });
        });
        return off;
    }, [qc]);
}
