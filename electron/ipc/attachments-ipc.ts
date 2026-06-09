/**
 * IPC handlers for image attachments. Stores images under
 * `~/.javis/attachments/<sessionId>/`, returns absolute paths the renderer
 * can then thread back into `chat:send`.
 */
import {
    removeAttachment,
    saveImageAttachment,
} from "../attachments/image-utils";
import { ipcHandle } from "./ipc-handle";

export function registerAttachmentsIpc(): void {
    ipcHandle("attachments:saveImage", async (sessionId, base64, mimeType) => {
        const attachment = await saveImageAttachment(sessionId, base64, mimeType);
        return { success: true, attachment };
    });

    ipcHandle("attachments:remove", async (filePath) => {
        await removeAttachment(filePath);
        return { success: true };
    });
}
