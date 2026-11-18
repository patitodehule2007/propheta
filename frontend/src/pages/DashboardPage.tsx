import type { CSSProperties, JSX } from "react";
import { useCallback, useEffect, useState } from "react";

import { DecisionChip, ErrorBanner, ProbabilityBar, Readout, SkeletonRows } from "../components/ui";
import { extractErrorMessage } from "../shared/apiError";
import { formatEnumValue, readTicker, readTradePriceMarks } from "../shared/decisionFormat";
import { requestService } from "../shared/requestService";
import type { DecisionLogEntry } from "../types/decisions";

const RECENT_DECISIONS_LIMIT = 10;
const SKELETON_ROWS = 6;
const DECISION_SKELETON_WIDTHS = [70, 80, 60, 50];
const NOT_AVAILABLE_NOTE = "Not available yet";
const EMPTY_REASON = "—";

interface DecisionsResponse {
    data: { items: DecisionLogEntry[]; totalCount: number };
}

/** Dashboard readouts whose backend modules don't exist yet (functionality_&_limits.md §3-4). */
const PENDING_READOUTS: readonly string[] = ["PnL", "Open positions", "Latency p95", "Hit rate"];

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const fullDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });

async function fetchRecentDecisions(): Promise<DecisionLogEntry[]> {
    const response = await requestService.get<DecisionsResponse>("/webhooks/x/decisions", {
        params: { limit: RECENT_DECISIONS_LIMIT, offset: 0 }
    });
    return response.data.data.items;
}

/**
 * The detail cell: a price bar when the entry carries real prices, otherwise
 * the ticker and/or reason.
 */
function DecisionDetail({ entry }: { entry: DecisionLogEntry }): JSX.Element {
    const marks = readTradePriceMarks(entry.metadata);
    if (marks !== null) {
        return (
            <ProbabilityBar
                ticker={marks.ticker}
                priceCents={marks.entryPriceCents}
                stopCents={marks.stopPriceCents}
                targetCents={marks.targetPriceCents}
            />
        );
    }
    const ticker = readTicker(entry.metadata);
    const reason = entry.reason ?? EMPTY_REASON;
    return (
        <span title={reason}>
            {ticker !== null && <span className="prob-ticker">{ticker} </span>}
            <span className="tape-cell-muted">{reason}</span>
        </span>
    );
}

function DecisionRow({ entry, index }: { entry: DecisionLogEntry; index: number }): JSX.Element {
    const createdAt = new Date(entry.createdAt);
    const style = { "--enter-index": index } as CSSProperties;
    return (
        <li className="tape-row ui-enter" style={style}>
            <time className="tape-cell mono" dateTime={entry.createdAt} title={fullDateFormatter.format(createdAt)}>
                {timeFormatter.format(createdAt)}
            </time>
            <span className="tape-cell tape-cell-stage tape-cell-muted mono">{formatEnumValue(entry.stage)}</span>
            <span className="tape-cell">
                <DecisionChip decision={entry.decision} />
            </span>
            <span className="tape-cell tape-cell-detail">
                <DecisionDetail entry={entry} />
            </span>
        </li>
    );
}

function DecisionsBody({
    decisions,
    isLoading,
    loadError,
    onRetry
}: {
    decisions: DecisionLogEntry[];
    isLoading: boolean;
    loadError: string | null;
    onRetry: () => void;
}): JSX.Element {
    if (isLoading) {
        return (
            <SkeletonRows
                rows={SKELETON_ROWS}
                tapeClassName="decisions-tape"
                columnWidths={DECISION_SKELETON_WIDTHS}
                label="Loading recent decisions"
            />
        );
    }
    if (loadError !== null) return <ErrorBanner message={loadError} onRetry={onRetry} />;
    if (decisions.length === 0) return <p className="empty-state">No decisions logged yet.</p>;

    return (
        <div className="tape decisions-tape">
            <div className="tape-head" aria-hidden="true">
                <span>Time</span>
                <span>Stage</span>
                <span>Decision</span>
                <span>Market / reason</span>
            </div>
            <ol className="tape">
                {decisions.map((entry, index) => (
                    <DecisionRow key={entry.id} entry={entry} index={index} />
                ))}
            </ol>
        </div>
    );
}

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

    return (
        <>
            <div className="page-head">
                <h1 className="page-title">Dashboard</h1>
            </div>

            <section className="readout-row" aria-label="Trading readouts">
                {PENDING_READOUTS.map((label) => (
                    <Readout key={label} label={label} value={null} note={NOT_AVAILABLE_NOTE} />
                ))}
            </section>

            <section className="panel" aria-labelledby="recent-decisions-title">
                <div className="panel-head">
                    <h2 id="recent-decisions-title" className="panel-title">
                        Recent decisions
                    </h2>
                    {!isLoading && loadError === null && decisions.length > 0 && (
                        <span className="panel-count mono">last {decisions.length}</span>
                    )}
                </div>
                <DecisionsBody decisions={decisions} isLoading={isLoading} loadError={loadError} onRetry={handleRetry} />
            </section>
        </>
    );
}
