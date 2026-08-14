import type { JSX } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuthStore } from "../store/authStore";

/**
 * Shared nav shell for every authenticated page (Dashboard, Accounts).
 */
export function DashboardLayout(): JSX.Element {
    const logout = useAuthStore((state) => state.logout);
    const navigate = useNavigate();

    async function handleLogout(): Promise<void> {
        await logout();
        navigate("/login", { replace: true });
    }

    return (
        <div className="app-layout">
            <nav className="sidebar">
                <div className="sidebar-brand">Propheta</div>
                <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
                    Dashboard
                </NavLink>
                <NavLink to="/accounts" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
                    Accounts
                </NavLink>
                <div className="sidebar-spacer" />
                <button type="button" className="btn" onClick={() => void handleLogout()}>
                    Logout
                </button>
            </nav>
            <main className="content">
                <Outlet />
            </main>
        </div>
    );
}
