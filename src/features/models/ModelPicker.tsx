import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Cpu } from "lucide-react";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from "@/components/ui/select";
import { useModels } from "@/features/models/useModels";
import { SESSIONS_QUERY_KEY, sessionDetailKey } from "@/features/sessions/useSessions";

interface Props {
    sessionId: string;
    currentModel: string | undefined;
}

export default function ModelPicker({ sessionId, currentModel }: Props) {
    const qc = useQueryClient();
    const { data: models = [], isLoading } = useModels();

    const setModel = useMutation<void, Error, string>({
        mutationFn: (modelId) => window.sessionsAPI.setModel(sessionId, modelId),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
            void qc.invalidateQueries({ queryKey: sessionDetailKey(sessionId) });
        },
    });

    // Pick a sensible "current" display value: prefer currentModel if it's
    // present in the list, otherwise show whatever the SDK returned first.
    const selected = currentModel ?? (models[0]?.id);
    const selectedName = models.find((m) => m.id === selected)?.name;
    const label = isLoading ? "Loading…" : (selectedName ?? "Pick a model");

    return (
        <Select
            value={selected ?? undefined}
            onValueChange={(v) => setModel.mutate(v)}
            disabled={isLoading || models.length === 0 || setModel.isPending}
        >
            <SelectTrigger
                aria-label={label}
                title={label}
                className="h-8 w-8 justify-center border-transparent bg-transparent p-0 shadow-none hover:bg-(--accent) [&>svg]:hidden"
            >
                <span className="flex items-center justify-center">
                    <Cpu className="h-3.5 w-3.5 opacity-60" />
                </span>
            </SelectTrigger>
            <SelectContent className="w-56 min-w-56">
                {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-2">
                            <span>{m.name}</span>
                            {m.supportsVision && (
                                <span className="rounded bg-(--secondary) px-1 text-[10px] text-(--muted-foreground)">
                                    vision
                                </span>
                            )}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
