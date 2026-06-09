import { X } from "lucide-react";

import type { PendingAttachment } from "@/features/attachments/useAttachments";

interface Props {
    attachments: PendingAttachment[];
    onRemove: (path: string) => void;
}

export default function AttachmentStrip({ attachments, onRemove }: Props) {
    if (attachments.length === 0) return null;
    return (
        <ul className="flex flex-wrap gap-2 px-1 pb-2">
            {attachments.map((a) => (
                <li
                    key={a.path}
                    className="group relative h-16 w-16 overflow-hidden rounded border border-(--border) bg-(--secondary)"
                >
                    <img src={a.previewUrl} alt={a.displayName ?? "attachment"} className="h-full w-full object-cover" />
                    <button
                        type="button"
                        onClick={() => onRemove(a.path)}
                        className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Remove attachment"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </li>
            ))}
        </ul>
    );
}
