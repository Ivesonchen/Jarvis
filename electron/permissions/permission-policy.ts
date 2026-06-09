/**
 * Permission policy — synchronous evaluator that classifies an incoming
 * {@link PermissionRequest} as auto-allow, auto-deny, or "prompt the user".
 *
 * Decision precedence (highest first):
 *   1. SHELL_BLOCK_PATTERN — explicit user block-list (`alwaysBlockShell`).
 *   2. SENSITIVE_PATH      — read/write requests whose path matches
 *                            `permissions.sensitivePaths` → always prompt
 *                            (overrides every allow rule below).
 *   3. FOLDER_DENY         — read/write paths under `folderAccess.denied`.
 *   4. TOOL_AUTO_APPROVE   — `alwaysAllowTools[toolKey] === true`.
 *   5. FOLDER_ALLOW        — read/write paths under `folderAccess.allowed`.
 *   6. READ_ONLY           — shell command on the read-only allowlist AND
 *                            setting enabled.
 *   7. SHELL_ALLOW_PATTERN — user allow-list (`alwaysAllowShell`).
 *   8. DEFAULT             — `permissions.defaultShellTier` for shell;
 *                            "prompt" for everything else.
 */
import type { PermissionRequest } from "@github/copilot-sdk";

import type { AppSettings } from "@common/settings-schema";

import { isReadOnlyCommand, matchesAnyGlob } from "./permission-classifier";

export type PolicyDecision = "allow" | "deny" | "prompt";

export interface PolicyVerdict {
    decision: PolicyDecision;
    reason: string;
}

/** Stable structured-tool key, used as the dictionary key in `alwaysAllowTools`. */
export function toolKeyFor(req: PermissionRequest): string {
    switch (req.kind) {
        case "shell":
            return "shell";
        case "write":
        case "read":
            return req.kind;
        case "mcp":
            return `mcp/${req.serverName}/${req.toolName}`;
        case "custom-tool":
            return `custom-tool/${req.toolName}`;
        case "url":
            return "url";
        case "memory":
            return "memory";
        case "hook":
            return `hook/${req.toolName}`;
        default:
            return req.kind;
    }
}

/** Extract the on-disk path for read/write requests, normalized for matching. */
function fsPathFor(req: PermissionRequest): string | undefined {
    if (req.kind === "read") return req.path;
    if (req.kind === "write") return req.fileName;
    return undefined;
}

/** Returns true if `child` is `parent` or sits underneath it (case-insensitive on Windows). */
function isUnder(parent: string, child: string): boolean {
    const isWin = process.platform === "win32";
    const norm = (s: string) => (isWin ? s.toLowerCase() : s).replace(/[/\\]+$/, "");
    const p = norm(parent);
    const c = norm(child);
    if (!p || !c) return false;
    if (c === p) return true;
    return c.startsWith(p + "/") || c.startsWith(p + "\\");
}

export function evaluate(req: PermissionRequest, settings: AppSettings): PolicyVerdict {
    const { permissions: P } = settings;
    const fsPath = fsPathFor(req);

    // 1. Explicit block-list for shell (deny wins).
    if (req.kind === "shell") {
        if (matchesAnyGlob(P.alwaysBlockShell, req.fullCommandText)) {
            return { decision: "deny", reason: "Blocked by alwaysBlockShell pattern" };
        }
    }

    // 2. Sensitive paths always force a prompt (.env, ~/.ssh, …).
    if (fsPath && matchesAnyGlob(P.sensitivePaths, fsPath)) {
        return { decision: "prompt", reason: "Path matches sensitivePaths — manual approval required" };
    }

    // 3. Folder deny-list takes precedence over any allow rule below.
    if (fsPath && P.folderAccess.denied.some((d) => isUnder(d, fsPath))) {
        return { decision: "deny", reason: "Path under folderAccess.denied" };
    }

    // 4. Tool-key always-allow.
    const key = toolKeyFor(req);
    if (P.alwaysAllowTools[key] === true) {
        return { decision: "allow", reason: `alwaysAllowTools[${key}]` };
    }

    // 5. Folder allow-list for read/write.
    if (fsPath && P.folderAccess.allowed.some((a) => isUnder(a, fsPath))) {
        return { decision: "allow", reason: "Path under folderAccess.allowed" };
    }

    // 6. Read-only shell.
    if (req.kind === "shell" && P.autoApproveReadOnly) {
        // Prefer the SDK's own parsed `commands[].readOnly` when available.
        const parsedReadOnly =
            Array.isArray(req.commands) &&
            req.commands.length > 0 &&
            req.commands.every((c) => c.readOnly === true);
        if (parsedReadOnly && !req.hasWriteFileRedirection) {
            return { decision: "allow", reason: "SDK marked all sub-commands read-only" };
        }
        if (isReadOnlyCommand(req.fullCommandText)) {
            return { decision: "allow", reason: "Matches read-only command allowlist" };
        }
    }

    // 7. Shell allow-pattern.
    if (req.kind === "shell" && matchesAnyGlob(P.alwaysAllowShell, req.fullCommandText)) {
        return { decision: "allow", reason: "Matches alwaysAllowShell pattern" };
    }

    // 8. Default tier (shell only — everything else always prompts).
    if (req.kind === "shell") {
        if (P.defaultShellTier === "auto-approve") {
            return { decision: "allow", reason: "Default tier: auto-approve" };
        }
        if (P.defaultShellTier === "block") {
            return { decision: "deny", reason: "Default tier: block" };
        }
    }

    return { decision: "prompt", reason: "No matching rule — prompting user" };
}
