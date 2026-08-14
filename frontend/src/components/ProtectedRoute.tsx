import type { JSX } from "react";
import { Navigate, Outlet } from "react-router-dom";

import { useAuthStore } from "../store/authStore";

/**
 * Layout route: renders its children via `Outlet` when authenticated,
 * otherwise redirects to `/login`. Waits for the initial session check
 * (`fetchCurrentUser`, triggered in `App`) before deciding.
 */
export function ProtectedRoute(): JSX.Element {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const isLoading = useAuthStore((state) => state.isLoading);

    if (isLoading) {
        return <div className="empty-state">Loading...</div>;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}
