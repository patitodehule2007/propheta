import type { CSSProperties, JSX } from "react";

const MIN_CENTS = 0;
const MAX_CENTS = 100;

export interface ProbabilityBarProps {
    ticker: string | null;
    /** Contract entry price in cents (0–100), i.e. the implied probability. */
    priceCents: number;
    stopCents?: number | null;
    targetCents?: number | null;
}

function clampCents(value: number): number {
    return Math.min(MAX_CENTS, Math.max(MIN_CENTS, value));
}

function markStyle(cents: number): CSSProperties {
    return { "--prob": clampCents(cents) } as CSSProperties;
}

/**
 * A Kalshi contract price drawn on its 0–100¢ range, with optional stop and target marks.
 *
 * @param props - Ticker, entry price, and optional stop/target prices in cents.
 * @returns The rendered bar with its value.
 */
export function ProbabilityBar({ ticker, priceCents, stopCents, targetCents }: ProbabilityBarProps): JSX.Element {
    const hasStop = typeof stopCents === "number";
    const hasTarget = typeof targetCents === "number";
    const description = [
        `entry ${priceCents}¢`,
        hasStop ? `stop ${stopCents}¢` : null,
        hasTarget ? `target ${targetCents}¢` : null
    ]
        .filter((part) => part !== null)
        .join(", ");

    return (
        <span className="prob">
            {ticker !== null && <span className="prob-ticker">{ticker}</span>}
            <span className="prob-track" role="img" aria-label={description} style={markStyle(priceCents)}>
                <span className="prob-fill" />
                {hasStop && <span className="prob-mark" data-kind="stop" style={markStyle(stopCents)} />}
                {hasTarget && <span className="prob-mark" data-kind="target" style={markStyle(targetCents)} />}
            </span>
            <span className="prob-value">{priceCents}¢</span>
        </span>
    );
}
