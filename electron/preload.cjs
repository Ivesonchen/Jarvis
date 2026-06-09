// CommonJS preload — runs in an isolated, sandboxed context.
// Exposes one global per IPC namespace via `contextBridge.exposeInMainWorld`.
// Keep types in sync with `common/ipc-contract.ts` (InvokeMethodsFor<NS>).
const { contextBridge, ipcRenderer } = require("electron");

// ── helpers ────────────────────────────────────────────────────────────

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

function subscribe(channel, cb) {
  const handler = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// ── namespaces ─────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld("appAPI", {
  openExternal: (url) => unwrap(ipcRenderer.invoke("app:openExternal", url)),
  getVersion: () => unwrap(ipcRenderer.invoke("app:getVersion")),
});

contextBridge.exposeInMainWorld("windowAPI", {
  minimize: () => unwrap(ipcRenderer.invoke("window:minimize")),
  toggleMaximize: () => unwrap(ipcRenderer.invoke("window:toggleMaximize")),
  close: () => unwrap(ipcRenderer.invoke("window:close")),
  isMaximized: () => unwrap(ipcRenderer.invoke("window:isMaximized")),
  onMaximizedChanged: (cb) => subscribe("window:maximizedChanged", cb),
});

contextBridge.exposeInMainWorld("authAPI", {
  startDeviceFlow: () => unwrap(ipcRenderer.invoke("auth:startDeviceFlow")),
  cancelDeviceFlow: () => unwrap(ipcRenderer.invoke("auth:cancelDeviceFlow")),
  checkAuth: () => unwrap(ipcRenderer.invoke("auth:checkAuth")),
  signOut: () => unwrap(ipcRenderer.invoke("auth:signOut")),
  onLoginSucceeded: (cb) => subscribe("auth:loginSucceeded", cb),
  onLoginFailed: (cb) => subscribe("auth:loginFailed", cb),
});

contextBridge.exposeInMainWorld("sessionsAPI", {
  list: () => unwrap(ipcRenderer.invoke("sessions:list")),
  create: () => unwrap(ipcRenderer.invoke("sessions:create")),
  open: (sessionId) => unwrap(ipcRenderer.invoke("sessions:open", sessionId)),
  delete: (sessionId) => unwrap(ipcRenderer.invoke("sessions:delete", sessionId)),
  rename: (sessionId, title) => unwrap(ipcRenderer.invoke("sessions:rename", sessionId, title)),
  setModel: (sessionId, modelId) =>
    unwrap(ipcRenderer.invoke("sessions:setModel", sessionId, modelId)),
  onChanged: (cb) => subscribe("sessions:changed", cb),
});

contextBridge.exposeInMainWorld("modelsAPI", {
  list: () => unwrap(ipcRenderer.invoke("models:list")),
});

contextBridge.exposeInMainWorld("settingsAPI", {
  get: () => unwrap(ipcRenderer.invoke("settings:get")),
  update: (patch) => unwrap(ipcRenderer.invoke("settings:update", patch)),
  revealInExplorer: () => unwrap(ipcRenderer.invoke("settings:revealInExplorer")),
  onChanged: (cb) => subscribe("settings:changed", cb),
  onOpenRequested: (cb) => subscribe("settings:openRequested", cb),
});

contextBridge.exposeInMainWorld("permissionsAPI", {
  list: (sessionId) => unwrap(ipcRenderer.invoke("permissions:list", sessionId)),
  respond: (requestId, action) =>
    unwrap(ipcRenderer.invoke("permissions:respond", requestId, action)),
  onChanged: (cb) => subscribe("permissions:changed", cb),
});

contextBridge.exposeInMainWorld("attachmentsAPI", {
  saveImage: (sessionId, base64, mimeType) =>
    unwrap(ipcRenderer.invoke("attachments:saveImage", sessionId, base64, mimeType)),
  remove: (path) => unwrap(ipcRenderer.invoke("attachments:remove", path)),
});

contextBridge.exposeInMainWorld("screenAPI", {
  capturePrimary: () => unwrap(ipcRenderer.invoke("screen:capturePrimary")),
});

contextBridge.exposeInMainWorld("chatAPI", {
  send: (sessionId, prompt, attachments) =>
    unwrap(ipcRenderer.invoke("chat:send", sessionId, prompt, attachments)),
  abort: (sessionId) => unwrap(ipcRenderer.invoke("chat:abort", sessionId)),
  onStreamDelta: (cb) => subscribe("chat:streamDelta", cb),
  onStreamDone: (cb) => subscribe("chat:streamDone", cb),
  onReasoningDelta: (cb) => subscribe("chat:reasoningDelta", cb),
  onReasoningDone: (cb) => subscribe("chat:reasoningDone", cb),
  onToolStart: (cb) => subscribe("chat:toolStart", cb),
  onToolProgress: (cb) => subscribe("chat:toolProgress", cb),
  onToolComplete: (cb) => subscribe("chat:toolComplete", cb),
  onTurnStart: (cb) => subscribe("chat:turnStart", cb),
  onTurnEnd: (cb) => subscribe("chat:turnEnd", cb),
  onIdle: (cb) => subscribe("chat:idle", cb),
  onError: (cb) => subscribe("chat:error", cb),
});

contextBridge.exposeInMainWorld("miniModeAPI", {
  sendQuick: (prompt) => unwrap(ipcRenderer.invoke("miniMode:sendQuick", prompt)),
  close: () => unwrap(ipcRenderer.invoke("miniMode:close")),
});
