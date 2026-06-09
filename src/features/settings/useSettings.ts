import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { AppSettings } from "@common/settings-schema";

export const SETTINGS_QUERY_KEY = ["settings"] as const;

export function useSettings() {
    return useQuery<AppSettings>({
        queryKey: SETTINGS_QUERY_KEY,
        queryFn: async () => {
            const { settings } = await window.settingsAPI.get();
            return settings;
        },
        staleTime: Infinity,
    });
}

export function useUpdateSettings() {
    const qc = useQueryClient();
    return useMutation<AppSettings, Error, Partial<AppSettings>>({
        mutationFn: async (patch) => {
            const { settings } = await window.settingsAPI.update(patch);
            return settings;
        },
        onSuccess: (settings) => {
            qc.setQueryData(SETTINGS_QUERY_KEY, settings);
        },
    });
}

export function useSettingsEventBridge(): void {
    const qc = useQueryClient();
    useEffect(() => {
        const off = window.settingsAPI.onChanged(({ settings }) => {
            qc.setQueryData(SETTINGS_QUERY_KEY, settings);
        });
        return off;
    }, [qc]);
}
