/**
 * Wrapper around `ipcMain.handle` that:
 *   1. Coerces thrown errors into the `IpcResult` envelope (so a renderer
 *      `await` never throws unexpectedly).
 *   2. Logs uncaught errors with the channel name so they show up in the
 *      diagnostic log instead of vanishing into Electron's stderr.
 *
 * Always use this instead of `ipcMain.handle` directly — when we later add
 * telemetry or a per-channel rate limiter, this is the only place to touch.
 */
import { ipcMain } from "electron";

import type { IpcInvokeMap, IpcResult } from "@common/ipc-contract";
import { createLogger } from "@common/logger";

const log = createLogger("ipc");

export type IpcHandler<C extends keyof IpcInvokeMap> = IpcInvokeMap[C] extends (
    ...args: infer A
) => Promise<infer R>
    ? (...args: A) => Promise<R> | R
    : never;

export function ipcHandle<C extends keyof IpcInvokeMap>(channel: C, handler: IpcHandler<C>): void {
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
        try {
            // The handler's argument types are constrained by IpcInvokeMap[C].
            // We forward the raw args; mistyped renderer calls fail at the handler.
            return await (handler as (...a: unknown[]) => Promise<unknown>)(...args);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`[${channel}] uncaught:`, err);
            const result: IpcResult = { success: false, error: message };
            return result;
        }
    });
}
