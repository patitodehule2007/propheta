/**
 * Number formatting for dashboard figures.
 */

import { ChipTone } from "./decisionFormat";

const CENTS_PER_DOLLAR = 100;
const MS_PER_SECOND = 1000;

const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const secondsFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Formats cents as US dollars.
 *
 * @param cents - Amount in cents.
 * @returns e.g. "$24.40".
 */
export function formatUsd(cents: number): string {
    return usdFormatter.format(cents / CENTS_PER_DOLLAR);
}

/**
 * Formats a PnL in cents with an explicit sign.
 *
 * @param cents - Signed amount in cents.
 * @returns e.g. "+$5.20", "−$1.10", "$0.00".
 */
export function formatSignedUsd(cents: number): string {
    if (cents > 0) return `+${formatUsd(cents)}`;
    if (cents < 0) return `−${formatUsd(Math.abs(cents))}`;
    return formatUsd(0);
}

/**
 * Maps a signed figure (e.g. a PnL) to its visual tone.
 *
 * @param value - Signed amount.
 * @returns Up when positive, down when negative, neutral at zero.
 */
export function toneForSignedValue(value: number): ChipTone {
    if (value > 0) return ChipTone.UP;
    if (value < 0) return ChipTone.DOWN;
    return ChipTone.NEUTRAL;
}

/**
 * Formats a duration in milliseconds as seconds.
 *
 * @param ms - Duration in milliseconds.
 * @returns e.g. "8.7s".
 */
export function formatSeconds(ms: number): string {
    return `${secondsFormatter.format(ms / MS_PER_SECOND)}s`;
}
