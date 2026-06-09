import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useModels } from "@/features/models/useModels";
import { useSettings, useUpdateSettings } from "@/features/settings/useSettings";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function SettingsDialog({ open, onOpenChange }: Props) {
    const { data: settings } = useSettings();
    const { data: models = [] } = useModels();
    const update = useUpdateSettings();

    // Local form state for new-pattern inputs.
    const [newAllow, setNewAllow] = useState("");
    const [newBlock, setNewBlock] = useState("");
    const [newAllowedFolder, setNewAllowedFolder] = useState("");
    const [newDeniedFolder, setNewDeniedFolder] = useState("");
    const [newSensitive, setNewSensitive] = useState("");
    const [hotkeyShowHide, setHotkeyShowHide] = useState("");
    const [hotkeyMini, setHotkeyMini] = useState("");

    useEffect(() => {
        if (settings) {
            setHotkeyShowHide(settings.hotkeys.showHide);
            setHotkeyMini(settings.hotkeys.miniMode);
        }
    }, [settings]);

    if (!settings) return null;

    const handleRevealFile = (): void => {
        void window.settingsAPI.revealInExplorer();
    };

    const addAllow = (): void => {
        const v = newAllow.trim();
        if (!v) return;
        update.mutate({
            permissions: {
                ...settings.permissions,
                alwaysAllowShell: [...settings.permissions.alwaysAllowShell, v],
            },
        });
        setNewAllow("");
    };

    const addBlock = (): void => {
        const v = newBlock.trim();
        if (!v) return;
        update.mutate({
            permissions: {
                ...settings.permissions,
                alwaysBlockShell: [...settings.permissions.alwaysBlockShell, v],
            },
        });
        setNewBlock("");
    };

    const removeAllow = (pattern: string): void => {
        update.mutate({
            permissions: {
                ...settings.permissions,
                alwaysAllowShell: settings.permissions.alwaysAllowShell.filter((p) => p !== pattern),
            },
        });
    };

    const removeBlock = (pattern: string): void => {
        update.mutate({
            permissions: {
                ...settings.permissions,
                alwaysBlockShell: settings.permissions.alwaysBlockShell.filter((p) => p !== pattern),
            },
        });
    };

    const addAllowedFolder = (): void => {
        const v = newAllowedFolder.trim();
        if (!v) return;
        update.mutate({
            permissions: {
                ...settings.permissions,
                folderAccess: {
                    ...settings.permissions.folderAccess,
                    allowed: [...settings.permissions.folderAccess.allowed, v],
                },
            },
        });
        setNewAllowedFolder("");
    };

    const removeAllowedFolder = (p: string): void => {
        update.mutate({
            permissions: {
                ...settings.permissions,
                folderAccess: {
                    ...settings.permissions.folderAccess,
                    allowed: settings.permissions.folderAccess.allowed.filter((x) => x !== p),
                },
            },
        });
    };

    const addDeniedFolder = (): void => {
        const v = newDeniedFolder.trim();
        if (!v) return;
        update.mutate({
            permissions: {
                ...settings.permissions,
                folderAccess: {
                    ...settings.permissions.folderAccess,
                    denied: [...settings.permissions.folderAccess.denied, v],
                },
            },
        });
        setNewDeniedFolder("");
    };

    const removeDeniedFolder = (p: string): void => {
        update.mutate({
            permissions: {
                ...settings.permissions,
                folderAccess: {
                    ...settings.permissions.folderAccess,
                    denied: settings.permissions.folderAccess.denied.filter((x) => x !== p),
                },
            },
        });
    };

    const addSensitive = (): void => {
        const v = newSensitive.trim();
        if (!v) return;
        update.mutate({
            permissions: {
                ...settings.permissions,
                sensitivePaths: [...settings.permissions.sensitivePaths, v],
            },
        });
        setNewSensitive("");
    };

    const removeSensitive = (p: string): void => {
        update.mutate({
            permissions: {
                ...settings.permissions,
                sensitivePaths: settings.permissions.sensitivePaths.filter((x) => x !== p),
            },
        });
    };

    const removeAllowedTool = (key: string): void => {
        const next = { ...settings.permissions.alwaysAllowTools };
        delete next[key];
        update.mutate({
            permissions: { ...settings.permissions, alwaysAllowTools: next },
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>
                        Saved to <code className="rounded bg-(--secondary) px-1 py-0.5 text-xs">~/.jarvis/settings.json</code>
                    </DialogDescription>
                </DialogHeader>

                {/* Appearance */}
                <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Appearance</h3>
                    <div className="flex items-center justify-between">
                        <label className="text-sm">Theme</label>
                        <div className="w-[160px]">
                            <Select
                                value={settings.theme}
                                onValueChange={(v) => update.mutate({ theme: v as "dark" | "light" | "system" })}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="dark">Dark</SelectItem>
                                    <SelectItem value="light">Light</SelectItem>
                                    <SelectItem value="system">System</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </section>

                <Separator />

                {/* Models */}
                <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Models</h3>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm">Default model for new chats</div>
                            <div className="text-xs text-(--muted-foreground)">
                                Existing chats keep their own model.
                            </div>
                        </div>
                        <div className="w-[220px]">
                            <Select
                                value={settings.defaultModel ?? "__auto__"}
                                onValueChange={(v) =>
                                    update.mutate({ defaultModel: v === "__auto__" ? undefined : v })
                                }
                            >
                                <SelectTrigger><SelectValue placeholder="Auto" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__auto__">Auto (CLI default)</SelectItem>
                                    {models.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </section>

                <Separator />

                {/* Permissions */}
                <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Permissions</h3>

                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm">Auto-approve read-only commands</div>
                            <div className="text-xs text-(--muted-foreground)">
                                <code className="rounded bg-(--secondary) px-1 py-0.5">ls</code>,{" "}
                                <code className="rounded bg-(--secondary) px-1 py-0.5">cat</code>,{" "}
                                <code className="rounded bg-(--secondary) px-1 py-0.5">git status</code>, etc.
                            </div>
                        </div>
                        <Switch
                            checked={settings.permissions.autoApproveReadOnly}
                            onCheckedChange={(checked) =>
                                update.mutate({
                                    permissions: { ...settings.permissions, autoApproveReadOnly: checked },
                                })
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm">Allow AI to request permission changes</div>
                            <div className="text-xs text-(--muted-foreground)">
                                When enabled, the model can propose permission changes in chat — each one still
                                requires your explicit approval.
                            </div>
                        </div>
                        <Switch
                            checked={settings.permissions.allowModelPermissionsChange}
                            onCheckedChange={(checked) =>
                                update.mutate({
                                    permissions: {
                                        ...settings.permissions,
                                        allowModelPermissionsChange: checked,
                                    },
                                })
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <label className="text-sm">Default for everything else</label>
                        <div className="w-[160px]">
                            <Select
                                value={settings.permissions.defaultShellTier}
                                onValueChange={(v) =>
                                    update.mutate({
                                        permissions: {
                                            ...settings.permissions,
                                            defaultShellTier: v as "auto-approve" | "prompt" | "block",
                                        },
                                    })
                                }
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto-approve">Auto-approve (risky)</SelectItem>
                                    <SelectItem value="prompt">Prompt</SelectItem>
                                    <SelectItem value="block">Block</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div>
                        <div className="mb-2 text-sm font-medium">Always allow (shell)</div>
                        <div className="mb-2 flex gap-2">
                            <Input
                                placeholder="git log*"
                                value={newAllow}
                                onChange={(e) => setNewAllow(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addAllow()}
                            />
                            <Button size="sm" onClick={addAllow}><Plus className="h-3.5 w-3.5" /></Button>
                        </div>
                        <ul className="flex flex-wrap gap-1.5">
                            {settings.permissions.alwaysAllowShell.map((p) => (
                                <li
                                    key={p}
                                    className="flex items-center gap-1 rounded bg-(--secondary) px-2 py-1 text-xs"
                                >
                                    <code>{p}</code>
                                    <button
                                        onClick={() => removeAllow(p)}
                                        className="text-(--muted-foreground) hover:text-(--destructive)"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </li>
                            ))}
                            {settings.permissions.alwaysAllowShell.length === 0 && (
                                <li className="text-xs text-(--muted-foreground)">No patterns yet.</li>
                            )}
                        </ul>
                    </div>

                    <div>
                        <div className="mb-2 text-sm font-medium">Always block (shell)</div>
                        <div className="mb-2 flex gap-2">
                            <Input
                                placeholder="rm -rf*"
                                value={newBlock}
                                onChange={(e) => setNewBlock(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addBlock()}
                            />
                            <Button size="sm" variant="destructive" onClick={addBlock}>
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <ul className="flex flex-wrap gap-1.5">
                            {settings.permissions.alwaysBlockShell.map((p) => (
                                <li
                                    key={p}
                                    className="flex items-center gap-1 rounded bg-(--destructive)/10 px-2 py-1 text-xs text-(--destructive)"
                                >
                                    <code>{p}</code>
                                    <button
                                        onClick={() => removeBlock(p)}
                                        className="text-(--muted-foreground) hover:text-(--destructive)"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </li>
                            ))}
                            {settings.permissions.alwaysBlockShell.length === 0 && (
                                <li className="text-xs text-(--muted-foreground)">No patterns yet.</li>
                            )}
                        </ul>
                    </div>

                    <div>
                        <div className="mb-2 text-sm font-medium">Folder access — allowed</div>
                        <div className="mb-1 text-xs text-(--muted-foreground)">
                            Read &amp; write requests under these folders skip the approval prompt.
                        </div>
                        <div className="mb-2 flex gap-2">
                            <Input
                                placeholder={`C:\\Users\\you\\projects`}
                                value={newAllowedFolder}
                                onChange={(e) => setNewAllowedFolder(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addAllowedFolder()}
                            />
                            <Button size="sm" onClick={addAllowedFolder}>
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <ul className="flex flex-wrap gap-1.5">
                            {settings.permissions.folderAccess.allowed.map((p) => (
                                <li
                                    key={p}
                                    className="flex items-center gap-1 rounded bg-(--secondary) px-2 py-1 text-xs"
                                >
                                    <code className="truncate">{p}</code>
                                    <button
                                        onClick={() => removeAllowedFolder(p)}
                                        className="text-(--muted-foreground) hover:text-(--destructive)"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </li>
                            ))}
                            {settings.permissions.folderAccess.allowed.length === 0 && (
                                <li className="text-xs text-(--muted-foreground)">No folders yet.</li>
                            )}
                        </ul>
                    </div>

                    <div>
                        <div className="mb-2 text-sm font-medium">Folder access — denied</div>
                        <div className="mb-1 text-xs text-(--muted-foreground)">
                            The AI may never read or write under these folders, even with always-allow set.
                        </div>
                        <div className="mb-2 flex gap-2">
                            <Input
                                placeholder={`C:\\Windows\\System32`}
                                value={newDeniedFolder}
                                onChange={(e) => setNewDeniedFolder(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addDeniedFolder()}
                            />
                            <Button size="sm" variant="destructive" onClick={addDeniedFolder}>
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <ul className="flex flex-wrap gap-1.5">
                            {settings.permissions.folderAccess.denied.map((p) => (
                                <li
                                    key={p}
                                    className="flex items-center gap-1 rounded bg-(--destructive)/10 px-2 py-1 text-xs text-(--destructive)"
                                >
                                    <code className="truncate">{p}</code>
                                    <button
                                        onClick={() => removeDeniedFolder(p)}
                                        className="text-(--muted-foreground) hover:text-(--destructive)"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </li>
                            ))}
                            {settings.permissions.folderAccess.denied.length === 0 && (
                                <li className="text-xs text-(--muted-foreground)">No folders yet.</li>
                            )}
                        </ul>
                    </div>

                    <div>
                        <div className="mb-2 text-sm font-medium">Sensitive paths</div>
                        <div className="mb-1 text-xs text-(--muted-foreground)">
                            Glob patterns that always require manual approval, even when the folder is allowed.
                        </div>
                        <div className="mb-2 flex gap-2">
                            <Input
                                placeholder=".env, **/.ssh/**"
                                value={newSensitive}
                                onChange={(e) => setNewSensitive(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addSensitive()}
                            />
                            <Button size="sm" onClick={addSensitive}>
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <ul className="flex flex-wrap gap-1.5">
                            {settings.permissions.sensitivePaths.map((p) => (
                                <li
                                    key={p}
                                    className="flex items-center gap-1 rounded bg-(--secondary) px-2 py-1 text-xs"
                                >
                                    <code>{p}</code>
                                    <button
                                        onClick={() => removeSensitive(p)}
                                        className="text-(--muted-foreground) hover:text-(--destructive)"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </li>
                            ))}
                            {settings.permissions.sensitivePaths.length === 0 && (
                                <li className="text-xs text-(--muted-foreground)">None.</li>
                            )}
                        </ul>
                    </div>

                    <div>
                        <div className="mb-2 text-sm font-medium">Always-allow tool calls</div>
                        <div className="mb-1 text-xs text-(--muted-foreground)">
                            Tool keys you have marked with “Always allow” in past prompts.
                        </div>
                        <ul className="flex flex-wrap gap-1.5">
                            {Object.entries(settings.permissions.alwaysAllowTools)
                                .filter(([, v]) => v === true)
                                .map(([key]) => (
                                    <li
                                        key={key}
                                        className="flex items-center gap-1 rounded bg-(--secondary) px-2 py-1 text-xs"
                                    >
                                        <code>{key}</code>
                                        <button
                                            onClick={() => removeAllowedTool(key)}
                                            className="text-(--muted-foreground) hover:text-(--destructive)"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </li>
                                ))}
                            {Object.values(settings.permissions.alwaysAllowTools).every((v) => !v) && (
                                <li className="text-xs text-(--muted-foreground)">
                                    None — granted from approval prompts.
                                </li>
                            )}
                        </ul>
                    </div>
                </section>

                <Separator />

                {/* Window + Hotkeys */}
                <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Window & hotkeys</h3>

                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm">Close to tray</div>
                            <div className="text-xs text-(--muted-foreground)">
                                Keep running in the background when the main window closes.
                            </div>
                        </div>
                        <Switch
                            checked={settings.window.closeToTray}
                            onCheckedChange={(checked) =>
                                update.mutate({ window: { ...settings.window, closeToTray: checked } })
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        <label className="text-sm">Show/hide hotkey</label>
                        <div className="flex w-[260px] gap-2">
                            <Input
                                placeholder="CommandOrControl+Shift+Space"
                                value={hotkeyShowHide}
                                onChange={(e) => setHotkeyShowHide(e.target.value)}
                                onBlur={() =>
                                    update.mutate({
                                        hotkeys: { ...settings.hotkeys, showHide: hotkeyShowHide.trim() },
                                    })
                                }
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        <label className="text-sm">Mini-mode hotkey</label>
                        <div className="flex w-[260px] gap-2">
                            <Input
                                placeholder="CommandOrControl+Shift+J"
                                value={hotkeyMini}
                                onChange={(e) => setHotkeyMini(e.target.value)}
                                onBlur={() =>
                                    update.mutate({
                                        hotkeys: { ...settings.hotkeys, miniMode: hotkeyMini.trim() },
                                    })
                                }
                            />
                        </div>
                    </div>
                </section>

                <Separator />

                <div className="flex items-center justify-between">
                    <Button variant="outline" size="sm" onClick={handleRevealFile}>
                        <FolderOpen className="h-3.5 w-3.5" />
                        Open settings file
                    </Button>
                    <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
