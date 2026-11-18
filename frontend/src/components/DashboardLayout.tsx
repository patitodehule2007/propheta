import type { JSX, RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "../store/authStore";
import { StatusBar } from "./StatusBar";
import { Button, ButtonVariant } from "./ui";

interface NavItem {
    to: string;
    label: string;
    isEnd: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
    { to: "/", label: "Dashboard", isEnd: true },
    { to: "/accounts", label: "Accounts", isEnd: false }
];

function navLinkClass({ isActive }: { isActive: boolean }): string {
    return `nav-link ui-dim${isActive ? " active" : ""}`;
}

/**
 * Moves one indicator to the active nav link's box so it slides between links.
 * Writes CSS variables on the indicator directly; the first placement is instant.
 */
function useNavIndicator(): {
    navRef: RefObject<HTMLDivElement | null>;
    indicatorRef: RefObject<HTMLSpanElement | null>;
} {
    const navRef = useRef<HTMLDivElement | null>(null);
    const indicatorRef = useRef<HTMLSpanElement | null>(null);
    const hasPlacedRef = useRef(false);
    const location = useLocation();

    useLayoutEffect(() => {
        const indicator = indicatorRef.current;
        const active = navRef.current?.querySelector<HTMLElement>(".nav-link.active") ?? null;
        if (indicator === null) return;
        if (active === null) {
            indicator.hidden = true;
            return;
        }
        indicator.hidden = false;
        indicator.toggleAttribute("data-instant", !hasPlacedRef.current);
        indicator.style.setProperty("--indicator-y", `${active.offsetTop}px`);
        indicator.style.setProperty("--indicator-h", `${active.offsetHeight}px`);
        hasPlacedRef.current = true;
    }, [location.pathname]);

    return { navRef, indicatorRef };
}

/**
 * Shared shell for every authenticated page: nav rail, status bar, content column.
 */
export function DashboardLayout(): JSX.Element {
    const logout = useAuthStore((state) => state.logout);
    const navigate = useNavigate();
    const { navRef, indicatorRef } = useNavIndicator();

    async function handleLogout(): Promise<void> {
        await logout();
        navigate("/login", { replace: true });
    }

    return (
        <div className="app-layout">
            <nav className="rail" aria-label="Main">
                <div className="brand">Propheta</div>
                <div className="rail-nav" ref={navRef}>
                    <span className="rail-indicator" ref={indicatorRef} aria-hidden="true" />
                    {NAV_ITEMS.map((item) => (
                        <NavLink key={item.to} to={item.to} end={item.isEnd} className={navLinkClass}>
                            {item.label}
                        </NavLink>
                    ))}
                </div>
                <div className="rail-footer">
                    <Button variant={ButtonVariant.GHOST} onClick={() => void handleLogout()}>
                        Log out
                    </Button>
                </div>
            </nav>
            <div className="main">
                <StatusBar />
                <main className="content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
