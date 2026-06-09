/**
 * Approval broker — owns the in-memory queue of pending permission cards
 * and exposes a promise-based "wait for the user to respond" surface to
 * the session-manager.
 *
 * Lifetime is per-process: pending cards do NOT survive an app restart.
 * If a card is still unresolved when the user quits, the underlying SDK
 * permission request will be canceled when the session disconnects.
 */
import { randomUUID } from "node:crypto";

import type { PermissionRequest } from "@github/copilot-sdk";

import type { PermissionCard, PermissionResponseAction } from "@common/ipc-contract";
import { createLogger } from "@common/logger";

import { toolKeyFor } from "./permission-policy";

const log = createLogger("permission-broker");

/** 5-minute prompt window — long enough for a stepped-away user, short enough
 *  that abandoned requests don't accumulate forever. */
const PROMPT_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingEntry {
    card: PermissionCard;
    resolve: (action: PermissionResponseAction) => void;
    timer: NodeJS.Timeout;
}

export interface BrokerListener {
    (event: { kind: "added" | "resolved"; sessionId: string }): void;
}

export class ApprovalBroker {
    private pending = new Map<string, PendingEntry>();
    private listeners = new Set<BrokerListener>();

    onChange(fn: BrokerListener): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    private emit(event: { kind: "added" | "resolved"; sessionId: string }): void {
        for (const fn of this.listeners) {
            try {
                fn(event);
            } catch (err) {
                log.warn("listener threw:", err);
            }
        }
    }

    listForSession(sessionId: string): PermissionCard[] {
        return Array.from(this.pending.values())
            .filter((entry) => entry.card.sessionId === sessionId)
            .map((entry) => entry.card);
    }

    listAll(): PermissionCard[] {
        return Array.from(this.pending.values()).map((entry) => entry.card);
    }

    request(sessionId: string, req: PermissionRequest): Promise<PermissionResponseAction> {
        const card = buildCard(sessionId, req);
        return new Promise<PermissionResponseAction>((resolve) => {
            const timer = setTimeout(() => {
                if (this.pending.delete(card.requestId)) {
                    log.warn("permission card timed out", card.requestId);
                    this.emit({ kind: "resolved", sessionId });
                    resolve("deny");
                }
            }, PROMPT_TIMEOUT_MS);
            this.pending.set(card.requestId, { card, resolve, timer });
            this.emit({ kind: "added", sessionId });
        });
    }

    respond(requestId: string, action: PermissionResponseAction): boolean {
        const entry = this.pending.get(requestId);
        if (!entry) return false;
        this.pending.delete(requestId);
        clearTimeout(entry.timer);
        entry.resolve(action);
        this.emit({ kind: "resolved", sessionId: entry.card.sessionId });
        return true;
    }

    cardFor(requestId: string): PermissionCard | undefined {
        return this.pending.get(requestId)?.card;
    }

    /** Cancel every pending card for a session (returns `deny` to each). */
    cancelSession(sessionId: string): void {
        for (const [requestId, entry] of this.pending.entries()) {
            if (entry.card.sessionId !== sessionId) continue;
            this.pending.delete(requestId);
            clearTimeout(entry.timer);
            entry.resolve("deny");
        }
        this.emit({ kind: "resolved", sessionId });
    }
}

function buildCard(sessionId: string, req: PermissionRequest): PermissionCard {
    const requestId = randomUUID();
    switch (req.kind) {
        case "shell":
            return {
                requestId,
                sessionId,
                kind: "shell",
                title: "Run shell command",
                summary: req.intention || "Execute a shell command",
                intention: req.intention,
                warning: req.warning,
                detail: req.fullCommandText,
                canOfferSessionApproval: req.canOfferSessionApproval === true,
            };
        case "write":
            return {
                requestId,
                sessionId,
                kind: "write",
                title: "Write file",
                summary: req.intention || `Write to ${req.fileName}`,
                intention: req.intention,
                detail: req.fileName,
                canOfferSessionApproval: req.canOfferSessionApproval === true,
            };
        case "read":
            return {
                requestId,
                sessionId,
                kind: "read",
                title: "Read file",
                summary: req.intention || `Read ${req.path}`,
                intention: req.intention,
                detail: req.path,
                canOfferSessionApproval: false,
            };
        case "mcp":
            return {
                requestId,
                sessionId,
                kind: "mcp",
                title: `MCP tool: ${req.toolTitle || req.toolName}`,
                summary: `${req.serverName} / ${req.toolName}`,
                detail: `${toolKeyFor(req)} ${JSON.stringify(req.args ?? {})}`.slice(0, 500),
                canOfferSessionApproval: true,
            };
        case "custom-tool":
            return {
                requestId,
                sessionId,
                kind: "custom-tool",
                title: `Tool: ${req.toolName}`,
                summary: req.toolDescription || req.toolName,
                detail: `${req.toolName} ${JSON.stringify(req.args ?? {})}`.slice(0, 500),
                canOfferSessionApproval: true,
            };
        case "url":
            return {
                requestId,
                sessionId,
                kind: "url",
                title: "Fetch URL",
                summary: req.intention || req.url,
                intention: req.intention,
                detail: req.url,
                canOfferSessionApproval: true,
            };
        case "memory":
            return {
                requestId,
                sessionId,
                kind: "memory",
                title: "Memory operation",
                summary: req.fact.slice(0, 200),
                detail: req.fact,
                canOfferSessionApproval: false,
            };
        case "hook":
            return {
                requestId,
                sessionId,
                kind: "hook",
                title: `Hook: ${req.toolName}`,
                summary: req.hookMessage || `Hook gating ${req.toolName}`,
                detail: `${req.toolName} ${JSON.stringify(req.toolArgs ?? {})}`.slice(0, 500),
                canOfferSessionApproval: false,
            };
        default:
            return {
                requestId,
                sessionId,
                kind: "other",
                title: `Permission: ${req.kind}`,
                summary: req.kind,
                detail: JSON.stringify(req).slice(0, 500),
                canOfferSessionApproval: false,
            };
    }
}
