import type { JSX } from "react";
import { useEffect, useState } from "react";

import { extractErrorMessage } from "../shared/apiError";
import { requestService } from "../shared/requestService";
import type { DecisionLogEntry } from "../types/decisions";

const RECENT_DECISIONS_LIMIT = 10;

interface DecisionsResponse {
    data: { items: DecisionLogEntry[]; totalCount: number };
}

/**
 * Placeholder card for a dashboard section whose backend module doesn't
 * exist yet (see docs/projectDefenition/functionality_&_limits.md §3-4).
 */
function NotAvailableCard({ title }: { title: string }): JSX.Element {
    return (
        <div className="card">
            <h2 className="card-title">{title}</h2>
            <p className="empty-state">Not available yet.</p>
        </div>
    );
}

export function DashboardPage(): JSX.Element {
    const [decisions, setDecisions] = useState<DecisionLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadDecisions(): Promise<void> {
            setIsLoading(true);
            setLoadError(null);
            try {
                const response = await requestService.get<DecisionsResponse>("/webhooks/x/decisions", {
                    params: { limit: RECENT_DECISIONS_LIMIT, offset: 0 }
                });
                if (!cancelled) setDecisions(response.data.data.items);
            } catch (err) {
                if (!cancelled) setLoadError(extractErrorMessage(err, "Could not load recent decisions"));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        void loadDecisions();
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <>
            <h1 className="page-title">Dashboard</h1>

            <div className="card-grid">
                <NotAvailableCard title="X webhook connection" />
                <NotAvailableCard title="Kalshi WebSocket connection" />
                <NotAvailableCard title="Kill switch" />
            </div>

            <div className="card-grid">
                <NotAvailableCard title="Open positions" />
                <NotAvailableCard title="PnL" />
            </div>

            <div className="card-grid">
                <NotAvailableCard title="Latency (p50 / p95 / p99)" />
                <NotAvailableCard title="Hit rate by topic" />
            </div>

            <div className="card">
                <h2 className="card-title">Recent decisions</h2>

                {isLoading && <p className="empty-state">Loading...</p>}
                {!isLoading && loadError !== null && <p className="form-error">{loadError}</p>}
                {!isLoading && loadError === null && decisions.length === 0 && (
                    <p className="empty-state">No decisions logged yet.</p>
                )}
                {!isLoading && loadError === null && decisions.length > 0 && (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Stage</th>
                                <th>Decision</th>
                                <th>Reason</th>
                                <th>When</th>
                            </tr>
                        </thead>
                        <tbody>
                            {decisions.map((entry) => (
                                <tr key={entry.id}>
                                    <td>{entry.stage}</td>
                                    <td>{entry.decision}</td>
                                    <td>{entry.reason ?? "—"}</td>
                                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </>
    );
}
