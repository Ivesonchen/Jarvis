/**
 * Classify a shell command as read-only.
 *
 * The CLI's `PermissionRequestShell` already tags each parsed sub-command
 * with `readOnly`, so when the SDK gives us that array we can just check
 * "every command is read-only AND there's no write redirection." This
 * function is a defensive fallback for cases where we only have the raw
 * command text.
 *
 * The allowlist below is intentionally narrow — we'd rather prompt the
 * user than auto-approve a command we don't understand.
 */
const READ_ONLY_PREFIXES = [
    "ls",
    "pwd",
    "echo",
    "cat",
    "head",
    "tail",
    "wc",
    "grep",
    "rg",
    "find",
    "which",
    "type",
    "whoami",
    "date",
    "uname",
    "hostname",
    "id",
    "env",
    "printenv",
    "du",
    "df",
    "ps",
    "git status",
    "git log",
    "git diff",
    "git show",
    "git branch",
    "git remote",
    "git tag",
    "git config --get",
    "git rev-parse",
    "node -v",
    "node --version",
    "npm -v",
    "npm --version",
    "npm ls",
    "npm list",
    "pnpm -v",
    "pnpm --version",
    "pnpm list",
    "pnpm why",
    "tsc --version",
    "python --version",
    "python -V",
    "python3 --version",
];

// Characters that signal side effects (output redirection, command
// substitution, background) — disqualifies the entire command.
const SIDE_EFFECT_CHARS = /[>`$]/;

function stripFlags(segment: string): string {
    return segment.trim().replace(/\s+/g, " ");
}

function matchesPrefix(segment: string): boolean {
    const trimmed = stripFlags(segment);
    for (const prefix of READ_ONLY_PREFIXES) {
        if (trimmed === prefix) return true;
        if (trimmed.startsWith(prefix + " ")) return true;
    }
    return false;
}

/**
 * Returns `true` only when every chunk separated by `&&`, `||`, `;`, `|`
 * is on the read-only allowlist AND no side-effect characters appear.
 */
export function isReadOnlyCommand(command: string): boolean {
    const text = command.trim();
    if (!text) return false;
    if (SIDE_EFFECT_CHARS.test(text)) return false;

    const chunks = text.split(/&&|\|\||;|\|/g).map((c) => c.trim()).filter(Boolean);
    if (chunks.length === 0) return false;
    return chunks.every(matchesPrefix);
}

/**
 * Glob-match for user-supplied allow/block patterns. Supports `*` and
 * `?` only — keeps the surface tiny and predictable (no regex DoS).
 */
export function matchesGlob(pattern: string, input: string): boolean {
    // Escape regex metacharacters except our two wildcards.
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regex = "^" + escaped.replace(/\*/g, ".*").replace(/\?/g, ".") + "$";
    try {
        return new RegExp(regex).test(input);
    } catch {
        return false;
    }
}

export function matchesAnyGlob(patterns: ReadonlyArray<string>, input: string): boolean {
    return patterns.some((p) => matchesGlob(p, input));
}
