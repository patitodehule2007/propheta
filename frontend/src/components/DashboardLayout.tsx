import type { JSX } from "react";
import { Outlet, useNavigate } from "react-router-dom";

import { useAuthStore } from "../store/authStore";
import { AppShell } from "./AppShell";
import type { NavItem } from "./AppShell";
import { Button, ButtonVariant } from "./ui";

const NAV_ITEMS: readonly NavItem[] = [
    { to: "/", label: "Dashboard", isEnd: true },
    { to: "/accounts", label: "Accounts", isEnd: false }
];

/**
 * Shared shell for every authenticated page: nav rail, status bar, content column.
 */
export function DashboardLayout(): JSX.Element {
    const logout = useAuthStore((state) => state.logout);
    const navigate = useNavigate();

    async function handleLogout(): Promise<void> {
        await logout();
        navigate("/login", { replace: true });
    }

    return (
        <AppShell
            navItems={NAV_ITEMS}
            railFooter={
                <Button variant={ButtonVariant.GHOST} onClick={() => void handleLogout()}>
                    Log out
                </Button>
            }
        >
            <Outlet />
        </AppShell>
    );
}
