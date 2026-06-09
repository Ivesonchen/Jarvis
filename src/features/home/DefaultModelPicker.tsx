import { Cpu } from "lucide-react";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from "@/components/ui/select";
import { useModels } from "@/features/models/useModels";
import { useSettings, useUpdateSettings } from "@/features/settings/useSettings";

interface Props {
    disabled?: boolean;
}

/**
 * Compact default-model picker for the welcome composer. Binds to
 * `settings.defaultModel`; new sessions inherit it through
 * `SessionManager.setDefaultModel()` in main.
 */
export default function DefaultModelPicker({ disabled }: Props) {
    const { data: settings } = useSettings();
    const update = useUpdateSettings();
    const { data: models = [], isLoading } = useModels();

    const selected = settings?.defaultModel ?? models[0]?.id;
    const selectedName = models.find((m) => m.id === selected)?.name;
    const label = isLoading ? "Loading…" : (selectedName ?? "Pick a model");
    const handleChange = (modelId: string): void => {
        if (!settings) return;
        update.mutate({ ...settings, defaultModel: modelId });
    };

    return (
        <Select
            value={selected ?? undefined}
            onValueChange={handleChange}
            disabled={disabled || isLoading || models.length === 0 || update.isPending}
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
