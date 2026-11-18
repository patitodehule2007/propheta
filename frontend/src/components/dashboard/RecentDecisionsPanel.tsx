import type { CSSProperties, JSX } from "react";

import { formatEnumValue, readTicker, readTradePriceMarks } from "../../shared/decisionFormat";
import type { DecisionLogEntry } from "../../types/decisions";
import { DecisionChip, ErrorBanner, ProbabilityBar, SkeletonRows } from "../ui";

const SKELETON_ROWS = 6;
const DECISION_SKELETON_WIDTHS = [70, 80, 60, 50];
const EMPTY_REASON = "—";

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const fullDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });

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

function DecisionRow({
    entry,
    index,
    isHighlighted
}: {
    entry: DecisionLogEntry;
    index: number;
    isHighlighted: boolean;
}): JSX.Element {
    const createdAt = new Date(entry.createdAt);
    const style = { "--enter-index": index } as CSSProperties;
    return (
        <li className="tape-row ui-enter" style={style} data-highlighted={isHighlighted || undefined}>
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

interface DecisionsBodyProps {
    decisions: DecisionLogEntry[];
    isLoading: boolean;
    loadError: string | null;
    onRetry?: () => void;
    highlightedPostId: string | null;
}

function DecisionsBody({
    decisions,
    isLoading,
    loadError,
    onRetry,
    highlightedPostId
}: DecisionsBodyProps): JSX.Element {
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
                    <DecisionRow
                        key={entry.id}
                        entry={entry}
                        index={index}
                        isHighlighted={highlightedPostId !== null && entry.platformPostId === highlightedPostId}
                    />
                ))}
            </ol>
        </div>
    );
}

/**
 * The `decision_log` tape: every stage outcome, newest first.
 *
 * @param props - Decisions plus their load state; rows of `highlightedPostId` are marked.
 * @returns The rendered panel.
 */
export function RecentDecisionsPanel(props: DecisionsBodyProps): JSX.Element {
    const { decisions, isLoading, loadError } = props;
    return (
        <section className="panel" aria-labelledby="recent-decisions-title">
            <div className="panel-head">
                <h2 id="recent-decisions-title" className="panel-title">
                    Recent decisions
                </h2>
                {!isLoading && loadError === null && decisions.length > 0 && (
                    <span className="panel-count mono">last {decisions.length}</span>
                )}
            </div>
            <DecisionsBody {...props} />
        </section>
    );
}
