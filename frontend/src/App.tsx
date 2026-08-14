import type { JSX } from "react";
import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";

import { DashboardLayout } from "./components/DashboardLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AccountsPage } from "./pages/AccountsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { useAuthStore } from "./store/authStore";

/**
 * Application root. Restores the session (if any) once on mount, then
 * routes to the login page or the protected dashboard shell.
 */
export function App(): JSX.Element {
    const fetchCurrentUser = useAuthStore((state) => state.fetchCurrentUser);

    useEffect(() => {
        void fetchCurrentUser();
    }, [fetchCurrentUser]);

    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
                <Route element={<DashboardLayout />}>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/accounts" element={<AccountsPage />} />
                </Route>
            </Route>
        </Routes>
    );
}
