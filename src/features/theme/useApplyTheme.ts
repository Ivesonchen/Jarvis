import { useEffect } from "react";

import { useSettings } from "@/features/settings/useSettings";

type Resolved = "dark" | "light";

function resolveSystemTheme(): Resolved {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Wire `[data-theme]` on the `<html>` element from the user's settings.
 * `"system"` follows `prefers-color-scheme` and reacts to OS-level changes.
 */
export function useApplyTheme(): void {
    const { data: settings } = useSettings();
    const theme = settings?.theme ?? "dark";

    useEffect(() => {
        const apply = (): void => {
            const resolved: Resolved = theme === "system" ? resolveSystemTheme() : theme;
            document.documentElement.dataset.theme = resolved;
        };
        apply();
        if (theme !== "system" || typeof window === "undefined") return;

        const mql = window.matchMedia("(prefers-color-scheme: dark)");
        mql.addEventListener("change", apply);
        return () => mql.removeEventListener("change", apply);
    }, [theme]);
}
