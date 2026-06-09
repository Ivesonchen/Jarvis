import { Minus, PanelLeft, Square, X } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

interface Props {
    onToggleSidebar: () => void;
}

/**
 * Frameless-window title bar. The whole strip is `-webkit-app-region: drag`,
 * but every interactive element opts back out with `.no-drag` so clicks land
 * on the button instead of starting a window drag.
 *
 * On macOS we use Electron's `hiddenInset` style which keeps the traffic
 * lights — so we pad the left side to make room. On Windows/Linux we draw our
 * own min/max/close icons (right-aligned), so we pad the right side instead.
 */
export default function TitleBar({ onToggleSidebar }: Props) {
    const [isMac] = useState(() => navigator.platform.toLowerCase().includes("mac"));
    const [maximized, setMaximized] = useState(false);

    useEffect(() => {
        void window.windowAPI.isMaximized().then((s) => setMaximized(s.isMaximized));
        return window.windowAPI.onMaximizedChanged((p) => setMaximized(p.isMaximized));
    }, []);

    return (
        <div
            className={cn(
                "drag-region flex h-10 shrink-0 items-center border-b border-(--border) bg-(--background) select-none",
                isMac ? "pl-20" : "pl-2",
            )}
        >
            {/* Sidebar toggle — left-aligned, opts out of drag. */}
            <button
                className="no-drag flex h-8 w-8 items-center justify-center rounded-md text-(--muted-foreground) hover:bg-(--accent) hover:text-(--foreground)"
                onClick={onToggleSidebar}
                title="Toggle sidebar"
            >
                <PanelLeft className="h-4 w-4" />
            </button>

            {/* Centered brand. The wrapper stays draggable so users can grab
              anywhere outside the badge to move the window. */}
            <div className="pointer-events-none flex flex-1 items-center justify-center gap-2">
                <span className="text-sm font-medium text-(--foreground)">Javis</span>
                <span className="javis-brand-gradient rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-black">
                    DEV
                </span>
            </div>

            {/* Windows/Linux window controls. macOS uses native traffic lights. */}
            {!isMac && (
                <div className="no-drag flex h-full items-stretch">
                    <button
                        className="flex w-11 items-center justify-center text-(--muted-foreground) hover:bg-(--accent) hover:text-(--foreground)"
                        onClick={() => void window.windowAPI.minimize()}
                        title="Minimize"
                    >
                        <Minus className="h-4 w-4" />
                    </button>
                    <button
                        className="flex w-11 items-center justify-center text-(--muted-foreground) hover:bg-(--accent) hover:text-(--foreground)"
                        onClick={() => void window.windowAPI.toggleMaximize()}
                        title={maximized ? "Restore" : "Maximize"}
                    >
                        <Square className="h-3.5 w-3.5" />
                    </button>
                    <button
                        className="flex w-11 items-center justify-center text-(--muted-foreground) hover:bg-red-600 hover:text-white"
                        onClick={() => void window.windowAPI.close()}
                        title="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
