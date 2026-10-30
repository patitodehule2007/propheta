import { Orderbook, PriceLevel } from "../kalshi";

/**
 * Arithmetic the selection agent is never trusted with -- deriving asks from
 * a bids-only book, and fee amounts. `docs/projectDefenition/initial_investigation.md`
 * §5.4 (orderbook) and §5.8 (fees). Every candidate carries these numbers
 * pre-computed; the model reads them and never recomputes them.
 */

/**
 * Converts a Kalshi fixed-point dollar string (e.g. "0.5600") to integer
 * cents. Prices are bounded to 0.01-1.00 with at most 4 decimals, so a
 * float round-trip through `Number()` followed by rounding is exact at the
 * cent granularity this system operates at.
 */
export function dollarsToCents(dollars: string): number {
    return Math.round(Number(dollars) * 100);
}

/**
 * Best bid price, in cents. Kalshi's price levels are ascending, so the best
 * (highest) bid is the LAST element, not the first -- a documented trap.
 * Returns null when the side is empty (no resting bids).
 */
export function bestBidCents(levels: PriceLevel[]): number | null {
    const best = levels[levels.length - 1];
    return best ? dollarsToCents(best[0]) : null;
}

/**
 * Top-of-book size at the best bid, in contracts. Null when the side is empty.
 */
export function topOfBookContracts(levels: PriceLevel[]): number | null {
    const best = levels[levels.length - 1];
    return best ? Number(best[1]) : null;
}

export interface DerivedQuote {
    yesBidCents: number | null;
    yesAskCents: number | null;
    noBidCents: number | null;
    noAskCents: number | null;
    spreadCents: number | null;
    topOfBookContracts: number | null;
}

/**
 * Derives the full YES/NO bid/ask picture from a bids-only order book.
 * Kalshi publishes bids only: `yes_ask = 1.00 - best_no_bid` and
 * `no_ask = 1.00 - best_yes_bid` (YES + NO always sum to $1.00).
 *
 * TODO: `topOfBookContracts` is the depth at the best YES *bid*, but gate 4
 * (`riskGate.service.ts`) uses it as the depth available at the *ask* it buys
 * from. Buying YES at `yes_ask` lifts the best NO bid, so the YES-side depth
 * cap should read `no_dollars`, and buying NO should read `yes_dollars`.
 * Sizing is clamped against the wrong side of the book today. Fix by exposing
 * per-side ask depth (e.g. `yesAskContracts` / `noAskContracts`) and picking
 * by `outcomeSide` in the risk gate.
 */
export function deriveQuote(orderbook: Orderbook): DerivedQuote {
    const yesBidCents = bestBidCents(orderbook.yes_dollars);
    const noBidCents = bestBidCents(orderbook.no_dollars);
    const yesAskCents = noBidCents === null ? null : 100 - noBidCents;
    const noAskCents = yesBidCents === null ? null : 100 - yesBidCents;
    const spreadCents = yesAskCents !== null && yesBidCents !== null ? yesAskCents - yesBidCents : null;

    return {
        yesBidCents,
        yesAskCents,
        noBidCents,
        noAskCents,
        spreadCents,
        topOfBookContracts: topOfBookContracts(orderbook.yes_dollars)
    };
}

const CENTS_PER_DOLLAR = 100;

/**
 * Kalshi's general taker rate. A series' `fee_multiplier` scales this rate
 * (1 = the standard schedule, 0.5 = half) -- it is not the rate itself.
 */
export const KALSHI_BASE_TAKER_FEE_RATE = 0.07;

// Float products like 0.07 * 1 * 0.1 * 0.9 * 100 land a hair above the exact
// cent value; without the epsilon, ceil would round an exact cent up by one.
const FEE_ROUNDING_EPSILON = 1e-9;

/**
 * Per-series taker fee for `contracts` contracts at `priceCents`, rounded up
 * to the next cent: `0.07 x fee_multiplier x C x P x (1-P)`. `quadratic` and
 * `quadratic_with_maker_fees` share the taker formula: this system is
 * structurally taker (it reacts to a signal and needs immediate execution),
 * so the maker component of `quadratic_with_maker_fees` never applies here.
 *
 * `flat` is a documented gap: Kalshi's flat schedule is a PDF, not an API
 * field, so `fee_multiplier` is treated as a flat cents-per-contract value
 * until the real schedule (https://kalshi.com/docs/kalshi-fee-schedule.pdf)
 * is transcribed. Verify against a live series before trading anything on a
 * flat-fee series.
 *
 * @param priceCents - execution price, cents (1-99)
 * @param contracts - number of contracts
 * @param feeType - the series' own fee_type, as stored (DB round-trips it as
 * plain text, like every other categorical column in this codebase)
 * @param feeMultiplier - the series' own fee_multiplier, a scale on
 * `KALSHI_BASE_TAKER_FEE_RATE`
 * @returns total fee for the fill, in cents, rounded up
 */
export function computeFeeCents(priceCents: number, contracts: number, feeType: string, feeMultiplier: number): number {
    if (feeType === "flat") {
        return Math.ceil(feeMultiplier * contracts);
    }

    const priceDollars = priceCents / CENTS_PER_DOLLAR;
    const feeDollars = KALSHI_BASE_TAKER_FEE_RATE * feeMultiplier * contracts * priceDollars * (1 - priceDollars);
    return Math.ceil(feeDollars * CENTS_PER_DOLLAR - FEE_ROUNDING_EPSILON);
}

/**
 * Fee for a single contract at `priceCents` -- the `feePerContractAtAsk`
 * field every candidate carries.
 */
export function computeFeePerContractCents(priceCents: number, feeType: string, feeMultiplier: number): number {
    return computeFeeCents(priceCents, 1, feeType, feeMultiplier);
}
