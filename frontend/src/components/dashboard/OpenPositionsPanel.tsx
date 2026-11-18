import type { CSSProperties, JSX } from "react";

import { formatSignedUsd, toneForSignedValue } from "../../shared/format";
import type { OpenPosition } from "../../types/dashboard";
import { ProbabilityBar } from "../ui";
import { NOT_AVAILABLE_NOTE } from "./dashboard.constants";

const deadlineFormatter = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

function unrealizedCents(position: OpenPosition): number {
    return (position.markPriceCents - position.entryPriceCents) * position.contracts;
}

function PositionRow({ position, index }: { position: OpenPosition; index: number }): JSX.Element {
    const style = { "--enter-index": index } as CSSProperties;
    const pnlCents = unrealizedCents(position);
    return (
        <li className="tape-row ui-enter" style={style}>
            <span className="tape-cell position-market" title={position.marketTitle}>
                <span className="prob-ticker">{position.ticker}</span>
                <span className="tape-cell-muted">{position.marketTitle}</span>
            </span>
            <span className="tape-cell mono">
                {position.contracts} × {position.outcomeSide}
            </span>
            <span className="tape-cell">
                <ProbabilityBar
                    ticker={null}
                    priceCents={position.entryPriceCents}
                    stopCents={position.stopPriceCents}
                    targetCents={position.targetPriceCents}
                />
            </span>
            <span className="tape-cell mono">{position.markPriceCents}¢</span>
            <span className="tape-cell mono position-pnl" data-tone={toneForSignedValue(pnlCents)}>
                {formatSignedUsd(pnlCents)}
            </span>
            <time className="tape-cell mono tape-cell-muted tape-cell-end" dateTime={position.deadlineAt}>
                {deadlineFormatter.format(new Date(position.deadlineAt))}
            </time>
        </li>
    );
}

function PositionsBody({ positions }: { positions: OpenPosition[] | null }): JSX.Element {
    if (positions === null) return <p className="empty-state">{NOT_AVAILABLE_NOTE}.</p>;
    if (positions.length === 0) return <p className="empty-state">No open positions — the agent is flat.</p>;

    return (
        <div className="tape positions-tape">
            <div className="tape-head" aria-hidden="true">
                <span>Market</span>
                <span>Size</span>
                <span>Entry / stop / target</span>
                <span>Mark</span>
                <span>Unrealized</span>
                <span className="tape-cell-end">Exit by</span>
            </div>
            <ol className="tape">
                {positions.map((position, index) => (
                    <PositionRow key={position.id} position={position} index={index} />
                ))}
            </ol>
        </div>
    );
}

/**
 * Positions the agent currently holds on Kalshi.
 *
 * @param props - Open positions, or null when no backend source exists.
 * @returns The rendered panel.
 */
export function OpenPositionsPanel({ positions }: { positions: OpenPosition[] | null }): JSX.Element {
    return (
        <section className="panel" aria-labelledby="open-positions-title">
            <div className="panel-head">
                <h2 id="open-positions-title" className="panel-title">
                    Open positions
                </h2>
                {positions !== null && <span className="panel-count mono">{positions.length} open</span>}
            </div>
            <PositionsBody positions={positions} />
        </section>
    );
}
