import type { JSX, ReactNode } from "react";

import type { DashboardData } from "../../types/dashboard";
import { LatestPostPanel } from "./LatestPostPanel";
import { MetricsReadouts } from "./MetricsReadouts";
import { OpenPositionsPanel } from "./OpenPositionsPanel";
import { RecentDecisionsPanel } from "./RecentDecisionsPanel";

export interface DashboardViewProps {
    data: DashboardData;
    isLoadingDecisions: boolean;
    decisionsError: string | null;
    onRetryDecisions?: () => void;
    /** Extra controls rendered next to the page title. */
    headAside?: ReactNode;
}

/**
 * Presentational dashboard: readouts, latest post, open positions and the decisions tape.
 * Shared by the live page and the simulated demo so both render the exact same UI.
 *
 * @param props - Dashboard data plus the decisions load state.
 * @returns The rendered dashboard content.
 */
export function DashboardView({
    data,
    isLoadingDecisions,
    decisionsError,
    onRetryDecisions,
    headAside
}: DashboardViewProps): JSX.Element {
    return (
        <>
            <div className="page-head">
                <h1 className="page-title">Dashboard</h1>
                {headAside}
            </div>

            <MetricsReadouts metrics={data.metrics} />

            <LatestPostPanel post={data.latestPost} />

            <OpenPositionsPanel positions={data.openPositions} />

            <RecentDecisionsPanel
                decisions={data.decisions}
                isLoading={isLoadingDecisions}
                loadError={decisionsError}
                onRetry={onRetryDecisions}
                highlightedPostId={data.highlightedPostId}
            />
        </>
    );
}
