import { Loader2 } from "lucide-react";
import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "./useAuth";

/**
 * Route guard — redirects to /signin if the auth probe says we're not
 * authenticated. Shows a spinner during the first auth check so the page
 * doesn't briefly flash an empty home.
 */
export default function RequireAuth() {
    const { data, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-(--muted-foreground)" />
            </div>
        );
    }

    if (!data?.authenticated) {
        return <Navigate to="/signin" replace />;
    }

    return <Outlet />;
}
