import { useQuery } from "@tanstack/react-query";

import type { ModelSummary } from "@common/ipc-contract";

export const MODELS_QUERY_KEY = ["models"] as const;

export function useModels() {
    return useQuery<ModelSummary[]>({
        queryKey: MODELS_QUERY_KEY,
        queryFn: async () => {
            const { models } = await window.modelsAPI.list();
            return models;
        },
        staleTime: 5 * 60_000,
    });
}
