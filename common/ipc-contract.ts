/**
 * IPC contract — the single source of truth for typed channels between the
 * Electron main and renderer processes.
 *
 * Pattern (adapted from CatClaw):
 *   - `IpcInvokeMap`  — request/response channels (renderer → main, awaitable).
 *   - `IpcEventMap`   — one-way broadcast events (main → renderer).
 *   - All invoke handlers return `IpcResult<T>` — `{ success, error?, ...data }`.
 *   - `InvokeMethodsFor<NS>` derives the renderer-facing namespace API type
 *     from the channel map so renames are caught at compile time.
 */

// ────────────────────────────── envelope ─────────────────────────────────

import type { AppSettings as AppSettingsLike } from "./settings-schema";

/**
 * Standard envelope returned from every invoke handler.
 *
 * Success: `{ success: true, ...data }`
 * Failure: `{ success: false, error: "..." }`
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type IpcResult<T extends object = {}> =
    | ({ success: true; error?: undefined } & T)
    | { success: false; error: string };

// ────────────────────────────── auth ─────────────────────────────────────

export interface AuthStatus {
    authenticated: boolean;
    username?: string;
    /** "free" | "individual" | "business" | "enterprise" | undefined */
    copilotPlan?: string;
}

export interface DeviceFlowStart {
    /** 8-character code like "ABCD-1234" the user must type in the browser. */
    userCode: string;
    /** URL to open in browser; usually https://github.com/login/device */
    verificationUri: string;
}

// ────────────────────────────── sessions / chat ──────────────────────────

/**
 * Lightweight session summary surfaced to the renderer for the left-nav list.
 * The full event history is fetched on demand via `sessions:open`.
 */
export interface SessionSummary {
    sessionId: string;
    title: string;
    /** ISO timestamp of creation. */
    createdAt: string;
    /** ISO timestamp of last activity. */
    updatedAt: string;
    /** Model id last used in this session (may be undefined for brand-new sessions). */
    lastModel?: string;
    /** Working directory the session was created against. */
    workingDirectory: string;
}

/** Discriminated union: which "speaker" produced a message. */
export type ChatRole = "user" | "assistant" | "system";

/**
 * A single message in a conversation, as surfaced to the UI.
 * Built by collapsing SDK `user.message` + `assistant.message` events.
 */
export interface ChatMessage {
    id: string;
    role: ChatRole;
    content: string;
    /** ISO timestamp the message was created. */
    timestamp: string;
}

/** Snapshot of a session ready for the chat view. */
export interface SessionDetail {
    summary: SessionSummary;
    messages: ChatMessage[];
}

/** Live tool-call status displayed inline while a turn is running. */
export interface ToolStatus {
    /** SDK `toolCallId`. */
    id: string;
    /** Display name (e.g. `read_file`, `bash`, MCP `server/tool`). */
    name: string;
    /** Human-readable one-liner: what the tool is doing (file path, command, …). */
    description: string;
    /** True while in-flight; false once `tool.execution_complete` arrives. */
    running: boolean;
    /** Optional latest progress message from the SDK. */
    progress?: string;
}

// ────────────────────────────── models ───────────────────────────────────

export interface ModelSummary {
    id: string;
    name: string;
    supportsVision: boolean;
    supportsReasoningEffort: boolean;
}

// ────────────────────────────── permissions (phase 5) ────────────────────

/**
 * Permission-card payload surfaced to the renderer for any tool request
 * that wasn't auto-resolved by the policy. Only `kind: "shell" | "tool"`
 * is rendered explicitly; all other SDK kinds fall through into a generic
 * tool card so the user can still allow/deny.
 */
export type PermissionCardKind =
    | "shell"
    | "write"
    | "read"
    | "mcp"
    | "custom-tool"
    | "url"
    | "memory"
    | "hook"
    | "other";

export interface PermissionCard {
    requestId: string;
    sessionId: string;
    kind: PermissionCardKind;
    /** Short label shown as the card title (e.g. "Run shell command"). */
    title: string;
    /** Plain-text description of what the assistant is about to do. */
    summary: string;
    /** Optional one-paragraph rationale supplied by the assistant. */
    intention?: string;
    /** Optional warning emitted by the SDK (only for some kinds). */
    warning?: string;
    /** Original raw command text (shell) or tool key (`server/tool`). */
    detail: string;
    /** Whether the renderer may offer "Always allow this pattern". */
    canOfferSessionApproval: boolean;
}

export type PermissionResponseAction = "allow" | "allow-session" | "allow-always" | "deny";

// ────────────────────────────── attachments (phase 6) ────────────────────

/** Image attachment surfaced to the renderer + threaded through chat:send. */
export interface ChatAttachment {
    /** Absolute path on disk under `~/.jarvis/attachments/<sessionId>/`. */
    path: string;
    mimeType: string;
    byteSize: number;
    /** Original filename for display only. */
    displayName?: string;
}

// ────────────────────────────── invoke map ───────────────────────────────

export interface IpcInvokeMap {
    // ── app / diagnostics ──
    "app:openExternal": (url: string) => Promise<IpcResult>;
    "app:getVersion": () => Promise<IpcResult<{ version: string }>>;

    // ── window controls (custom title bar) ──
    "window:minimize": () => Promise<IpcResult>;
    "window:toggleMaximize": () => Promise<IpcResult<{ isMaximized: boolean }>>;
    "window:close": () => Promise<IpcResult>;
    "window:isMaximized": () => Promise<IpcResult<{ isMaximized: boolean }>>;

    // ── auth (phase 1) ──
    /** Start GitHub device-flow login. Resolves with the code+URL to display. */
    "auth:startDeviceFlow": () => Promise<IpcResult<DeviceFlowStart>>;
    /** Cancel an in-progress device-flow login (e.g. user closed the dialog). */
    "auth:cancelDeviceFlow": () => Promise<IpcResult>;
    /** Poll current auth state. Cheap — safe to call from React Query refetch. */
    "auth:checkAuth": () => Promise<IpcResult<{ status: AuthStatus }>>;
    /** Sign out: clear the CLI's stored credentials. */
    "auth:signOut": () => Promise<IpcResult>;

    // ── sessions (phase 2) ──
    /** List all sessions known to Jarvis (from local index). */
    "sessions:list": () => Promise<IpcResult<{ sessions: SessionSummary[] }>>;
    /** Create a brand-new session, returning its id. */
    "sessions:create": () => Promise<IpcResult<{ session: SessionSummary }>>;
    /** Open a session — resume on the SDK side and hydrate full message history. */
    "sessions:open": (sessionId: string) => Promise<IpcResult<{ detail: SessionDetail }>>;
    /** Permanently delete a session (SDK + local index). */
    "sessions:delete": (sessionId: string) => Promise<IpcResult>;
    /** Update a session's title. */
    "sessions:rename": (sessionId: string, title: string) => Promise<IpcResult>;
    /** Change the model for a session. */
    "sessions:setModel": (sessionId: string, modelId: string) => Promise<IpcResult>;

    // ── models (phase 3) ──
    /** List models exposed by the CLI for the signed-in user. */
    "models:list": () => Promise<IpcResult<{ models: ModelSummary[] }>>;

    // ── chat (phase 2) ──
    /** Send a message in an open session. Backend streams deltas via events. */
    "chat:send": (
        sessionId: string,
        prompt: string,
        attachments?: ChatAttachment[],
    ) => Promise<IpcResult<{ messageId: string }>>;
    /** Abort the in-flight assistant response for a session. */
    "chat:abort": (sessionId: string) => Promise<IpcResult>;

    // ── settings (phase 4) ──
    /** Read the entire settings document. */
    "settings:get": () => Promise<IpcResult<{ settings: AppSettingsLike }>>;
    /** Patch settings (deep-merged at top level by main). */
    "settings:update": (patch: Partial<AppSettingsLike>) => Promise<IpcResult<{ settings: AppSettingsLike }>>;
    /** Reveal the settings file in the OS file explorer. */
    "settings:revealInExplorer": () => Promise<IpcResult>;

    // ── permissions (phase 5) ──
    /** List pending permission cards for a session (or all sessions if omitted). */
    "permissions:list": (sessionId?: string) => Promise<IpcResult<{ cards: PermissionCard[] }>>;
    /** Respond to a pending card. */
    "permissions:respond": (
        requestId: string,
        action: PermissionResponseAction,
    ) => Promise<IpcResult>;

    // ── attachments (phase 6) ──
    /** Persist a base64-encoded image and return an absolute path. */
    "attachments:saveImage": (
        sessionId: string,
        base64: string,
        mimeType: string,
    ) => Promise<IpcResult<{ attachment: ChatAttachment }>>;
    /** Delete an attachment file. Best-effort. */
    "attachments:remove": (path: string) => Promise<IpcResult>;

    // ── screen capture ──
    /**
     * Capture the primary display as a PNG. Returns base64 PNG bytes so the
     * renderer can stage it as an in-memory attachment (saved on submit via
     * `attachments:saveImage` once a sessionId exists).
     */
    "screen:capturePrimary": () => Promise<
        IpcResult<{ base64: string; mimeType: string; width: number; height: number }>
    >;

    // ── mini-mode (phase 7) ──
    /** Open the mini-mode quick-prompt window. */
    "miniMode:open": () => Promise<IpcResult>;
    /** Close (hide) the mini-mode window. */
    "miniMode:close": () => Promise<IpcResult>;
    /**
     * Send a quick prompt to the most-recent session (or a new one). The
     * mini window typically calls this then immediately invokes `miniMode:close`.
     */
    "miniMode:sendQuick": (prompt: string) => Promise<IpcResult<{ sessionId: string }>>;
}

// ────────────────────────────── event map ────────────────────────────────

export interface IpcEventMap {
    /** Device flow completed — renderer should refresh auth state. */
    "auth:loginSucceeded": { username: string };
    /** Device flow failed — show error to user. */
    "auth:loginFailed": { reason: string };

    /** A session was added/removed/renamed — renderer should refetch the list. */
    "sessions:changed": { sessionId?: string };

    /** Streaming text delta from the assistant. */
    "chat:streamDelta": {
        sessionId: string;
        messageId: string;
        deltaContent: string;
    };
    /** Assistant message finalized — full content sent for consistency. */
    "chat:streamDone": {
        sessionId: string;
        messageId: string;
        content: string;
    };
    /** Streaming reasoning ("extended thinking") delta. */
    "chat:reasoningDelta": {
        sessionId: string;
        reasoningId: string;
        deltaContent: string;
    };
    /** Reasoning block finalized — full content for replacement. */
    "chat:reasoningDone": {
        sessionId: string;
        reasoningId: string;
        content: string;
    };
    /** A tool call just started. */
    "chat:toolStart": {
        sessionId: string;
        toolCallId: string;
        toolName: string;
        /** Display string assembled from arguments (file path, command, …). */
        description: string;
    };
    /** Tool progress message from the SDK (MCP servers, long-running shells). */
    "chat:toolProgress": {
        sessionId: string;
        toolCallId: string;
        progressMessage: string;
    };
    /** Tool call finished (success or error). */
    "chat:toolComplete": {
        sessionId: string;
        toolCallId: string;
        success: boolean;
        /** Set when `success: false`. */
        errorMessage?: string;
    };
    /** Turn started — UI should show "Processing" / stop button right away. */
    "chat:turnStart": { sessionId: string };
    /** Turn ended (matches the SDK `assistant.turn_end` event). */
    "chat:turnEnd": { sessionId: string };
    /** Session became idle after a turn (success or abort). */
    "chat:idle": { sessionId: string; aborted: boolean };
    /** Surface a session-level error to the UI. */
    "chat:error": { sessionId: string; message: string; errorType?: string };

    /** Settings document changed (any source). */
    "settings:changed": { settings: AppSettingsLike };

    /** Renderer should open the Settings dialog (fired from tray). */
    "settings:openRequested": Record<string, never>;

    /** Pending permission cards for a session changed (added/resolved/timed out). */
    "permissions:changed": { sessionId: string };

    /** Window maximize state changed (custom title bar updates its toggle). */
    "window:maximizedChanged": { isMaximized: boolean };
}

// ────────────────────────────── derivation helpers ──────────────────────

/**
 * Drop the `IpcResult` wrapper so the renderer can write
 * `const { username } = await authAPI.checkAuth()` instead of unpacking the
 * `success` discriminant every call site. Renderer wrappers should throw
 * when `success === false`.
 */
export type UnwrapResult<R> = R extends Promise<infer V>
    ? V extends { success: true; error?: undefined } & infer D
    ? Promise<D>
    : V extends IpcResult<infer D>
    ? Promise<D>
    : Promise<V>
    : never;

/**
 * Given a namespace prefix like "auth", produce an object type whose methods
 * mirror the invoke map entries with that prefix.
 *
 * Example: `InvokeMethodsFor<"auth">` →
 *   { startDeviceFlow: () => Promise<...>; checkAuth: () => Promise<...>; ... }
 */
export type InvokeMethodsFor<NS extends string> = {
    [K in keyof IpcInvokeMap as K extends `${NS}:${infer Method}`
    ? Method
    : never]: IpcInvokeMap[K] extends (...args: infer A) => infer R
    ? (...args: A) => UnwrapResult<R>
    : never;
};

/**
 * Subscription callback type for event channels. Returns an unsubscribe fn.
 */
export type EventSubscribe<C extends keyof IpcEventMap> = (
    cb: (payload: IpcEventMap[C]) => void,
) => () => void;
