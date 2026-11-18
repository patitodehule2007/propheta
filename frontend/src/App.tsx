import type { JSX } from "react";
import { Suspense, useEffect } from "react";
import { Route, Routes } from "react-router-dom";

import { DashboardLayout } from "./components/DashboardLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DEMO_BASE_PATH } from "./demo/demo.constants";
import { LazyDemoDashboardPage } from "./demo/lazyDemoDashboardPage";
import { AccountsPage } from "./pages/AccountsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { installPressFeedback } from "./shared/pressFeedback";
import { useAuthStore } from "./store/authStore";

function DemoPage({ Page }: { Page: NonNullable<typeof LazyDemoDashboardPage> }): JSX.Element {
    return (
        <Suspense fallback={<div className="empty-state">Loading...</div>}>
            <Page />
        </Suspense>
    );
}

/**
 * Application root. Restores the session (if any) once on mount, then
 * routes to the login page or the protected dashboard shell.
 */
export function App(): JSX.Element {
    const fetchCurrentUser = useAuthStore((state) => state.fetchCurrentUser);

    useEffect(() => {
        void fetchCurrentUser();
    }, [fetchCurrentUser]);

    useEffect(() => installPressFeedback(), []);

    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            {LazyDemoDashboardPage !== null && (
                <>
                    <Route path={DEMO_BASE_PATH} element={<DemoPage Page={LazyDemoDashboardPage} />} />
                    <Route path={`${DEMO_BASE_PATH}/:scenarioId`} element={<DemoPage Page={LazyDemoDashboardPage} />} />
                </>
            )}
            <Route element={<ProtectedRoute />}>
                <Route element={<DashboardLayout />}>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/accounts" element={<AccountsPage />} />
                </Route>
            </Route>
        </Routes>
    );
}
