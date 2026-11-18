import type { JSX, ReactNode, RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";

import type { SystemStatus } from "../types/dashboard";
import { StatusBar } from "./StatusBar";

export interface NavItem {
    to: string;
    label: string;
    isEnd: boolean;
}

export interface AppShellProps {
    navItems: readonly NavItem[];
    /** Connection health for the status bar; omitted means "not wired". */
    status?: SystemStatus;
    railFooter: ReactNode;
    children: ReactNode;
}

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
 * Page chrome: nav rail, status bar and content column.
 *
 * @param props - Nav items, optional connection status, rail footer and page content.
 * @returns The rendered shell.
 */
export function AppShell({ navItems, status, railFooter, children }: AppShellProps): JSX.Element {
    const { navRef, indicatorRef } = useNavIndicator();

    return (
        <div className="app-layout">
            <nav className="rail" aria-label="Main">
                <div className="brand">Propheta</div>
                <div className="rail-nav" ref={navRef}>
                    <span className="rail-indicator" ref={indicatorRef} aria-hidden="true" />
                    {navItems.map((item) => (
                        <NavLink key={item.label} to={item.to} end={item.isEnd} className={navLinkClass}>
                            {item.label}
                        </NavLink>
                    ))}
                </div>
                <div className="rail-footer">{railFooter}</div>
            </nav>
            <div className="main">
                <StatusBar status={status} />
                <main className="content">{children}</main>
            </div>
        </div>
    );
}
