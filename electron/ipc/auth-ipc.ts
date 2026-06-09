/**
 * IPC handlers for sign-in flow (Phase 1).
 *
 * `registerAuthIpc(broadcast)` wires the four auth invoke handlers and
 * subscribes to login events from `AuthManager`, broadcasting them to the
 * renderer as `auth:loginSucceeded` / `auth:loginFailed`.
 */
import type { IpcEventMap } from "@common/ipc-contract";

import { getAuthManager } from "../auth-manager";
import { ipcHandle } from "./ipc-handle";

type Broadcast = <C extends keyof IpcEventMap>(channel: C, payload: IpcEventMap[C]) => void;

export function registerAuthIpc(broadcast: Broadcast): void {
    const auth = getAuthManager();

    ipcHandle("auth:startDeviceFlow", async () => {
        const result = await auth.startDeviceFlow();
        return { success: true, ...result };
    });

    ipcHandle("auth:cancelDeviceFlow", async () => {
        auth.cancelDeviceFlow();
        return { success: true };
    });

    ipcHandle("auth:checkAuth", async () => {
        const status = await auth.checkAuth();
        return { success: true, status };
    });

    ipcHandle("auth:signOut", async () => {
        await auth.signOut();
        return { success: true };
    });

    auth.onLoginEvent((ev) => {
        if (ev.type === "succeeded") {
            broadcast("auth:loginSucceeded", { username: ev.username });
        } else {
            broadcast("auth:loginFailed", { reason: ev.reason });
        }
    });
}
