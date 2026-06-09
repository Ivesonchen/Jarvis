import { Navigate, Route, Routes } from "react-router-dom";

import RequireAuth from "@/features/auth/RequireAuth";
import SignInPage from "@/features/auth/SignInPage";
import { useAuthEventBridge } from "@/features/auth/useAuth";
import HomePage from "@/features/home/HomePage";
import { usePermissionsEventBridge } from "@/features/permissions/usePermissions";
import { useSessionsEventBridge } from "@/features/sessions/useSessions";
import { useSettingsEventBridge } from "@/features/settings/useSettings";
import { useApplyTheme } from "@/features/theme/useApplyTheme";

export default function App() {
  useApplyTheme();
  useAuthEventBridge();
  useSessionsEventBridge();
  useSettingsEventBridge();
  usePermissionsEventBridge();

  return (
    <Routes>
      <Route path="/signin" element={<SignInPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<HomePage />} />
        <Route path="/chat/:sessionId" element={<HomePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

