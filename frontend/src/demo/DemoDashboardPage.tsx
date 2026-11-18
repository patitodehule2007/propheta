import type { JSX } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import type { NavItem } from "../components/AppShell";
import { DashboardView } from "../components/dashboard";
import { Button, ButtonVariant } from "../components/ui";
import { DEMO_BASE_PATH } from "./demo.constants";
import { DEMO_SCENARIO_ORDER, DEMO_SCENARIOS, DemoScenarioId, isDemoScenarioId } from "./demoScenarios";
import type { DemoScenario } from "./demoScenarios";

/** `?clean=1` hides the demo chrome for clean presentation screenshots. */
const CLEAN_PARAM = "clean";
const CLEAN_VALUE = "1";

function scenarioPath(id: DemoScenarioId): string {
    return `${DEMO_BASE_PATH}/${id}`;
}

function DemoControls({ current }: { current: DemoScenario }): JSX.Element {
    return (
        <div className="demo-controls">
            <span className="demo-badge mono" title={current.caption}>
                SIMULATED
            </span>
            <nav className="demo-switch" aria-label="Demo scenario">
                {DEMO_SCENARIO_ORDER.map((id) => (
                    <Link
                        key={id}
                        to={scenarioPath(id)}
                        className="demo-switch-link ui-dim"
                        aria-current={id === current.id ? "page" : undefined}
                        title={DEMO_SCENARIOS[id].caption}
                    >
                        {DEMO_SCENARIOS[id].label}
                    </Link>
                ))}
            </nav>
        </div>
    );
}

/**
 * Simulated dashboard for presentations: the real dashboard components fed with
 * fixed scenario data, no backend and no login. Only routed when built with `VITE_ENABLE_DEMO=true`
 * (see `lazyDemoDashboardPage.ts`).
 */
export function DemoDashboardPage(): JSX.Element {
    const { scenarioId } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    if (!isDemoScenarioId(scenarioId)) return <Navigate to={scenarioPath(DemoScenarioId.BEFORE)} replace />;

    const scenario = DEMO_SCENARIOS[scenarioId];
    const isClean = searchParams.get(CLEAN_PARAM) === CLEAN_VALUE;
    const navItems: readonly NavItem[] = [
        { to: scenarioPath(scenario.id), label: "Dashboard", isEnd: true },
        { to: "/accounts", label: "Accounts", isEnd: false }
    ];

    return (
        <AppShell
            navItems={navItems}
            status={scenario.status}
            railFooter={
                <Button variant={ButtonVariant.GHOST} onClick={() => navigate("/login")}>
                    Log out
                </Button>
            }
        >
            <DashboardView
                data={scenario.data}
                isLoadingDecisions={false}
                decisionsError={null}
                headAside={isClean ? undefined : <DemoControls current={scenario} />}
            />
        </AppShell>
    );
}
