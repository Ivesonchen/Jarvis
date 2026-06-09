/**
 * Canonical app settings schema + defaults. Used by:
 *   - main process `settings-store.ts` (validation, on-disk format)
 *   - renderer SettingsPanel (form state)
 *
 * Adding a field? Bump the version, write a migration in `settings-store.ts`,
 * and surface the field in the UI so it's discoverable.
 */
import { z } from "zod";

export const ShellPermissionTierSchema = z.enum(["auto-approve", "prompt", "block"]);
export type ShellPermissionTier = z.infer<typeof ShellPermissionTierSchema>;

/** Folder-access lists evaluated for `read` / `write` requests. */
export const FolderAccessSchema = z.object({
    /** Paths the AI can read & write without prompting (subdir-aware match). */
    allowed: z.array(z.string()).default([]),
    /** Paths the AI may never touch (subdir-aware match, deny wins). */
    denied: z.array(z.string()).default([]),
});
export type FolderAccess = z.infer<typeof FolderAccessSchema>;

export const PermissionSettingsSchema = z.object({
    /** Auto-approve well-known read-only commands (ls, cat, git status, …). */
    autoApproveReadOnly: z.boolean().default(true),
    /** Always prompt before running anything else. */
    defaultShellTier: ShellPermissionTierSchema.default("prompt"),
    /** Per-shell command patterns the user explicitly always allows. */
    alwaysAllowShell: z.array(z.string()).default([]),
    /** Patterns we always block, taking precedence over allow. */
    alwaysBlockShell: z.array(z.string()).default([]),
    /** Tool-name → permanent approval flag (e.g. `read_file: true`). */
    alwaysAllowTools: z.record(z.string(), z.boolean()).default({}),
    /** When true, the AI can propose permission changes mid-chat. Default false. */
    allowModelPermissionsChange: z.boolean().default(false),
    /** Per-folder allow/deny lists for read & write tool calls. */
    folderAccess: FolderAccessSchema.default({}),
    /** Glob/substring patterns that always require manual approval (e.g. `.env`). */
    sensitivePaths: z.array(z.string()).default([".env", ".env.*", "**/.ssh/**", "**/.aws/**"]),
});
export type PermissionSettings = z.infer<typeof PermissionSettingsSchema>;

export const HotkeySettingsSchema = z.object({
    /** Toggle main window. Electron accelerator string. */
    showHide: z.string().default(""),
    /** Open mini-mode quick prompt. */
    miniMode: z.string().default(""),
});
export type HotkeySettings = z.infer<typeof HotkeySettingsSchema>;

export const WindowSettingsSchema = z.object({
    /** When true, closing the main window hides it instead of quitting. */
    closeToTray: z.boolean().default(true),
    /** When true, launch on system startup. (Stubbed in Phase 7.) */
    launchOnStartup: z.boolean().default(false),
});
export type WindowSettings = z.infer<typeof WindowSettingsSchema>;

export const AppSettingsSchema = z.object({
    version: z.literal(1),
    theme: z.enum(["dark", "light", "system"]).default("dark"),
    defaultModel: z.string().optional(),
    permissions: PermissionSettingsSchema.default({}),
    hotkeys: HotkeySettingsSchema.default({}),
    window: WindowSettingsSchema.default({}),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export function defaultSettings(): AppSettings {
    return AppSettingsSchema.parse({ version: 1 });
}
