import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";

import { DashboardView, RECENT_DECISIONS_LIMIT } from "../components/dashboard";
import { extractErrorMessage } from "../shared/apiError";
import { requestService } from "../shared/requestService";
import type { DashboardData } from "../types/dashboard";
import type { DecisionLogEntry } from "../types/decisions";

interface DecisionsResponse {
    data: { items: DecisionLogEntry[]; totalCount: number };
}

async function fetchRecentDecisions(): Promise<DecisionLogEntry[]> {
    const response = await requestService.get<DecisionsResponse>("/webhooks/x/decisions", {
        params: { limit: RECENT_DECISIONS_LIMIT, offset: 0 }
    });
    return response.data.data.items;
}

/**
 * Live dashboard. Only the decisions tape has a backend source today; metrics,
 * latest post and open positions render "Not available yet" (functionality_&_limits.md §3-4).
 */
export function DashboardPage(): JSX.Element {
    const [decisions, setDecisions] = useState<DecisionLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function run(): Promise<void> {
            try {
                const items = await fetchRecentDecisions();
                if (!cancelled) setDecisions(items);
            } catch (err) {
                if (!cancelled) setLoadError(extractErrorMessage(err, "Could not load recent decisions"));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        void run();
        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    const handleRetry = useCallback((): void => {
        setIsLoading(true);
        setLoadError(null);
        setReloadKey((key) => key + 1);
    }, []);

    const data: DashboardData = {
        metrics: null,
        latestPost: null,
        openPositions: null,
        decisions,
        highlightedPostId: null
    };

    return (
        <DashboardView
            data={data}
            isLoadingDecisions={isLoading}
            decisionsError={loadError}
            onRetryDecisions={handleRetry}
        />
    );
}
