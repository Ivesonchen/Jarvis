/**
 * Session index persistence.
 *
 * `~/.jarvis/sessions/sessions-index.json` is the authoritative list for the
 * UI. The Copilot SDK persists its own session state under `~/.copilot/`,
 * but Jarvis-specific metadata (the user-visible title, model history, sort
 * order) lives here.
 *
 * Mirrors the spirit of CatClaw's session index but kept intentionally small
 * for Phase 2.
 *
 * Writes use the temp-file + rename pattern so a crash mid-write can't
 * leave a half-written index that fails parsing on next boot.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { z } from "zod";

import type { SessionSummary } from "@common/ipc-contract";
import { createLogger } from "@common/logger";

import { getSessionsDir } from "../app-paths";

const log = createLogger("session-store");

const SessionSummarySchema = z.object({
    sessionId: z.string().min(1),
    title: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    lastModel: z.string().optional(),
    workingDirectory: z.string(),
});

const IndexSchema = z.object({
    version: z.literal(1),
    sessions: z.array(SessionSummarySchema),
});

type Index = z.infer<typeof IndexSchema>;

const EMPTY_INDEX: Index = { version: 1, sessions: [] };

function indexPath(): string {
    return path.join(getSessionsDir(), "sessions-index.json");
}

function readIndex(): Index {
    const file = indexPath();
    if (!fs.existsSync(file)) return EMPTY_INDEX;
    let raw: string;
    try {
        raw = fs.readFileSync(file, "utf-8");
    } catch (err) {
        log.warn("failed to read sessions-index.json:", err);
        return EMPTY_INDEX;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw) as unknown;
    } catch (err) {
        log.warn("sessions-index.json is invalid JSON, starting fresh:", err);
        return EMPTY_INDEX;
    }

    const result = IndexSchema.safeParse(parsed);
    if (!result.success) {
        log.warn("sessions-index.json failed schema validation:", result.error.message);
        return EMPTY_INDEX;
    }
    return result.data;
}

function writeIndex(idx: Index): void {
    const file = indexPath();
    const tmp = file + ".tmp";
    const payload = JSON.stringify(idx, null, 2);
    fs.writeFileSync(tmp, payload, { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, file);
}

// ───── public API ─────────────────────────────────────────────────────────

export function listSessions(): SessionSummary[] {
    const idx = readIndex();
    // Newest-first by updatedAt.
    return [...idx.sessions].sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
}

export function getSession(sessionId: string): SessionSummary | undefined {
    return readIndex().sessions.find((s) => s.sessionId === sessionId);
}

export function upsertSession(summary: SessionSummary): void {
    const idx = readIndex();
    const i = idx.sessions.findIndex((s) => s.sessionId === summary.sessionId);
    if (i >= 0) {
        idx.sessions[i] = summary;
    } else {
        idx.sessions.push(summary);
    }
    writeIndex(idx);
}

export function deleteSession(sessionId: string): void {
    const idx = readIndex();
    const next = idx.sessions.filter((s) => s.sessionId !== sessionId);
    if (next.length === idx.sessions.length) return;
    writeIndex({ ...idx, sessions: next });
}

export function touchSession(
    sessionId: string,
    patch: Partial<Omit<SessionSummary, "sessionId" | "createdAt">>,
): SessionSummary | undefined {
    const idx = readIndex();
    const i = idx.sessions.findIndex((s) => s.sessionId === sessionId);
    if (i < 0) return undefined;
    const updated: SessionSummary = {
        ...idx.sessions[i],
        ...patch,
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
    idx.sessions[i] = updated;
    writeIndex(idx);
    return updated;
}
