// Mini-mode preload — small surface area for the quick-prompt window.
const { contextBridge, ipcRenderer } = require("electron");

function unwrap(promise) {
  return promise.then((result) => {
    if (result && result.success === false) {
      throw new Error(result.error || "IPC call failed");
    }
    if (result && typeof result === "object") {
      // eslint-disable-next-line no-unused-vars
      const { success, error, ...rest } = result;
      return rest;
    }
    return result;
  });
}

contextBridge.exposeInMainWorld("miniModeAPI", {
  sendQuick: (prompt) => unwrap(ipcRenderer.invoke("miniMode:sendQuick", prompt)),
  close: () => unwrap(ipcRenderer.invoke("miniMode:close")),
});
