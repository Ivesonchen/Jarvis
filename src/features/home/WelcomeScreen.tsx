import { Info } from "lucide-react";

interface Props {
    username: string | undefined;
}

/**
 * Empty-state hero shown when no session is selected. Just the greeting —
 * the bottom composer (rendered by HomePage) is the only entry point.
 */
export default function WelcomeScreen({ username }: Props) {
    const name = username ?? "there";

    return (
        <div className="flex h-full w-full items-center justify-center overflow-y-auto px-6 py-10">
            <div className="w-full max-w-3xl">
                <div className="flex items-center justify-center gap-2 text-center">
                    <h1 className="text-3xl font-semibold tracking-tight">
                        What&apos;s on deck, {name}?
                    </h1>
                    <Info className="h-4 w-4 text-(--muted-foreground)" />
                </div>
            </div>
        </div>
    );
}
