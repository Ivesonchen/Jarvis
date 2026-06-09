/**
 * Append-only JSONL audit log. One row per permission decision. Synchronous
 * because permissions are infrequent and out-of-order writes here would
 * scramble the timeline.
 */
import * as fs from "node:fs";

import { createLogger } from "@common/logger";

import { getAuditLogPath } from "../app-paths";

const log = createLogger("audit-log");

export type AuditEntry = {
    ts: string;
    sessionId: string;
    kind: string;
    decision: "allow" | "deny" | "auto-allow" | "auto-deny" | "timeout";
    reason: string;
    summary: string;
    requestId?: string;
};

export function appendAudit(entry: AuditEntry): void {
    try {
        fs.appendFileSync(getAuditLogPath(), JSON.stringify(entry) + "\n", { mode: 0o600 });
    } catch (err) {
        log.warn("appendAudit failed:", err);
    }
}
