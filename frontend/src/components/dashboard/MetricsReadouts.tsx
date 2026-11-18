import type { JSX } from "react";

import { formatSeconds, formatSignedUsd, formatUsd, toneForSignedValue } from "../../shared/format";
import type { TradingMetrics } from "../../types/dashboard";
import { Readout } from "../ui";
import { NOT_AVAILABLE_NOTE } from "./dashboard.constants";

/** Dashboard readouts whose backend modules don't exist yet (functionality_&_limits.md §3-4). */
const PENDING_READOUTS: readonly string[] = ["PnL", "Open positions", "Latency p95", "Hit rate"];

function openPositionsNote(metrics: TradingMetrics): string {
    if (metrics.openPositionCount === 0) return "flat · nothing at risk";
    return `${formatUsd(metrics.atRiskCents)} at risk`;
}

/**
 * The four headline figures. Without metrics every slot renders "Not available yet".
 *
 * @param props - Trading metrics, or null when no backend source exists.
 * @returns The rendered readout row.
 */
export function MetricsReadouts({ metrics }: { metrics: TradingMetrics | null }): JSX.Element {
    if (metrics === null) {
        return (
            <section className="readout-row" aria-label="Trading readouts">
                {PENDING_READOUTS.map((label) => (
                    <Readout key={label} label={label} value={null} note={NOT_AVAILABLE_NOTE} />
                ))}
            </section>
        );
    }

    return (
        <section className="readout-row" aria-label="Trading readouts">
            <Readout
                label="PnL"
                value={formatSignedUsd(metrics.pnlCents)}
                tone={toneForSignedValue(metrics.pnlCents)}
                note={`${formatSignedUsd(metrics.unrealizedPnlCents)} unrealized`}
            />
            <Readout
                label="Open positions"
                value={String(metrics.openPositionCount)}
                note={openPositionsNote(metrics)}
            />
            <Readout
                label="Latency p95"
                value={formatSeconds(metrics.latencyP95Ms)}
                note={`post → decision · ${metrics.decidedPostCount} posts`}
            />
            <Readout
                label="Hit rate"
                value={`${metrics.hitRatePercent}%`}
                note={`${metrics.closedTradeCount} closed trades`}
            />
        </section>
    );
}
