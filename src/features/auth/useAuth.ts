import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { AuthStatus, DeviceFlowStart } from "@common/ipc-contract";

export const AUTH_QUERY_KEY = ["auth"] as const;

/**
 * React Query for the current auth state. Refetches on focus + every 30s so a
 * sign-in completed in a different window propagates quickly.
 */
export function useAuth() {
    return useQuery<AuthStatus>({
        queryKey: AUTH_QUERY_KEY,
        queryFn: async () => {
            const { status } = await window.authAPI.checkAuth();
            return status;
        },
        refetchOnWindowFocus: true,
        refetchInterval: 30_000,
    });
}

/**
 * Mutation for kicking off device-flow login. On success the renderer shows
 * the device code; the actual sign-in completion arrives via the
 * `auth:loginSucceeded` IPC event.
 */
export function useStartDeviceFlow() {
    return useMutation<DeviceFlowStart, Error, void>({
        mutationFn: () => window.authAPI.startDeviceFlow(),
    });
}

export function useCancelDeviceFlow() {
    return useMutation<void, Error, void>({
        mutationFn: () => window.authAPI.cancelDeviceFlow(),
    });
}

export function useSignOut() {
    const qc = useQueryClient();
    return useMutation<void, Error, void>({
        mutationFn: () => window.authAPI.signOut(),
        onSettled: () => qc.invalidateQueries({ queryKey: AUTH_QUERY_KEY }),
    });
}

/**
 * Wires the main-process login events into the React Query cache. Mount once
 * at the app root.
 */
export function useAuthEventBridge(): void {
    const qc = useQueryClient();
    useEffect(() => {
        const offSucceeded = window.authAPI.onLoginSucceeded(() => {
            void qc.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
        });
        const offFailed = window.authAPI.onLoginFailed(() => {
            void qc.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
        });
        return () => {
            offSucceeded();
            offFailed();
        };
    }, [qc]);
}
