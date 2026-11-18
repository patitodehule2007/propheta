/**
 * Display helpers for `decision_log` values returned by the API.
 */

export const ChipTone = {
    UP: "up",
    DOWN: "down",
    NEUTRAL: "neutral"
} as const;
export type ChipTone = (typeof ChipTone)[keyof typeof ChipTone];

/** Outcomes that moved a trade forward or closed it in profit. */
const UP_OUTCOMES: ReadonlySet<string> = new Set([
    "PROPOSED",
    "ORDER_PLACED",
    "ORDER_SIMULATED",
    "EXIT_TAKE_PROFIT"
]);

/** Outcomes that blocked, failed, or closed a trade at a loss. */
const DOWN_OUTCOMES: ReadonlySet<string> = new Set([
    "REJECTED",
    "ORDER_FAILED",
    "EXIT_STOP_LOSS",
    "EXIT_FAILED"
]);

/**
 * Maps a `decision_log.decision` value to its visual tone.
 *
 * @param decision - Raw decision outcome from the API.
 * @returns The chip tone for that outcome.
 */
export function toneForDecision(decision: string): ChipTone {
    if (UP_OUTCOMES.has(decision)) return ChipTone.UP;
    if (DOWN_OUTCOMES.has(decision)) return ChipTone.DOWN;
    return ChipTone.NEUTRAL;
}

/**
 * Formats an UPPER_SNAKE_CASE enum value for display ("NO_TRADE" → "NO TRADE").
 *
 * @param value - Raw enum value.
 * @returns The value with underscores replaced by spaces.
 */
export function formatEnumValue(value: string): string {
    return value.replaceAll("_", " ");
}

/** Contract price marks carried in `decision_log.metadata` by ORDER-stage entries. */
export interface TradePriceMarks {
    ticker: string | null;
    entryPriceCents: number;
    stopPriceCents: number | null;
    targetPriceCents: number | null;
}

function readNumber(metadata: Record<string, unknown>, key: string): number | null {
    const value = metadata[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Reads real contract prices from a decision's metadata. Returns null when no entry
 * price was recorded, so the UI never draws a bar from invented data.
 *
 * @param metadata - Raw `decision_log.metadata`.
 * @returns The price marks, or null when the entry has no entry price.
 */
export function readTradePriceMarks(metadata: Record<string, unknown> | null): TradePriceMarks | null {
    if (metadata === null) return null;
    const entryPriceCents = readNumber(metadata, "entryPriceCents");
    if (entryPriceCents === null) return null;
    const ticker = metadata.ticker;
    return {
        ticker: typeof ticker === "string" ? ticker : null,
        entryPriceCents,
        stopPriceCents: readNumber(metadata, "stopPriceCents"),
        targetPriceCents: readNumber(metadata, "targetPriceCents")
    };
}

/**
 * Reads the market ticker from a decision's metadata, when one was recorded.
 *
 * @param metadata - Raw `decision_log.metadata`.
 * @returns The ticker, or null.
 */
export function readTicker(metadata: Record<string, unknown> | null): string | null {
    const ticker = metadata?.ticker;
    return typeof ticker === "string" ? ticker : null;
}
