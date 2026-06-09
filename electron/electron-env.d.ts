export { };

import type {
  AuthStatus,
  ChatAttachment,
  DeviceFlowStart,
  EventSubscribe,
  ModelSummary,
  PermissionCard,
  PermissionResponseAction,
  SessionDetail,
  SessionSummary,
} from "@common/ipc-contract";
import type { AppSettings } from "@common/settings-schema";

declare global {
  interface Window {
    appAPI: {
      openExternal: (url: string) => Promise<void>;
      getVersion: () => Promise<{ version: string }>;
    };
    windowAPI: {
      minimize: () => Promise<void>;
      toggleMaximize: () => Promise<{ isMaximized: boolean }>;
      close: () => Promise<void>;
      isMaximized: () => Promise<{ isMaximized: boolean }>;
      onMaximizedChanged: EventSubscribe<"window:maximizedChanged">;
    };
    authAPI: {
      startDeviceFlow: () => Promise<DeviceFlowStart>;
      cancelDeviceFlow: () => Promise<void>;
      checkAuth: () => Promise<{ status: AuthStatus }>;
      signOut: () => Promise<void>;
      onLoginSucceeded: EventSubscribe<"auth:loginSucceeded">;
      onLoginFailed: EventSubscribe<"auth:loginFailed">;
    };
    sessionsAPI: {
      list: () => Promise<{ sessions: SessionSummary[] }>;
      create: () => Promise<{ session: SessionSummary }>;
      open: (sessionId: string) => Promise<{ detail: SessionDetail }>;
      delete: (sessionId: string) => Promise<void>;
      rename: (sessionId: string, title: string) => Promise<void>;
      setModel: (sessionId: string, modelId: string) => Promise<void>;
      onChanged: EventSubscribe<"sessions:changed">;
    };
    modelsAPI: {
      list: () => Promise<{ models: ModelSummary[] }>;
    };
    settingsAPI: {
      get: () => Promise<{ settings: AppSettings }>;
      update: (patch: Partial<AppSettings>) => Promise<{ settings: AppSettings }>;
      revealInExplorer: () => Promise<void>;
      onChanged: EventSubscribe<"settings:changed">;
      onOpenRequested: EventSubscribe<"settings:openRequested">;
    };
    permissionsAPI: {
      list: (sessionId?: string) => Promise<{ cards: PermissionCard[] }>;
      respond: (requestId: string, action: PermissionResponseAction) => Promise<void>;
      onChanged: EventSubscribe<"permissions:changed">;
    };
    attachmentsAPI: {
      saveImage: (
        sessionId: string,
        base64: string,
        mimeType: string,
      ) => Promise<{ attachment: ChatAttachment }>;
      remove: (path: string) => Promise<void>;
    };
    screenAPI: {
      capturePrimary: () => Promise<{
        base64: string;
        mimeType: string;
        width: number;
        height: number;
      }>;
    };
    chatAPI: {
      send: (
        sessionId: string,
        prompt: string,
        attachments?: ChatAttachment[],
      ) => Promise<{ messageId: string }>;
      abort: (sessionId: string) => Promise<void>;
      onStreamDelta: EventSubscribe<"chat:streamDelta">;
      onStreamDone: EventSubscribe<"chat:streamDone">;
      onReasoningDelta: EventSubscribe<"chat:reasoningDelta">;
      onReasoningDone: EventSubscribe<"chat:reasoningDone">;
      onToolStart: EventSubscribe<"chat:toolStart">;
      onToolProgress: EventSubscribe<"chat:toolProgress">;
      onToolComplete: EventSubscribe<"chat:toolComplete">;
      onTurnStart: EventSubscribe<"chat:turnStart">;
      onTurnEnd: EventSubscribe<"chat:turnEnd">;
      onIdle: EventSubscribe<"chat:idle">;
      onError: EventSubscribe<"chat:error">;
    };
    miniModeAPI: {
      sendQuick: (prompt: string) => Promise<{ sessionId: string }>;
      close: () => Promise<void>;
    };
  }
}
