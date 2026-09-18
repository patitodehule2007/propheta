import { config } from "../../config";
import { getQuoteSamplesSince, QuoteSample } from "../../repositories/redis/marketQuote.repository";
import { HorizonSource } from "./trading.constants";

const MS_PER_MINUTE = 60_000;

/**
 * Pure functions for the exit policy every filled position gets: a deadline,
 * a stop loss and a gain top, computed at gate 4 and frozen with the
 * proposal. `docs/backend/tradeDecision.md` §"Exit policy - time limit, stop
 * loss, gain top".
 */

interface AtrResult {
    atrCents: number;
    velocityCentsPerMinute: number;
}

/**
 * Wilder ATR over quote-cache bars, adapted to a 0-100c bounded contract.
 * Returns null when fewer than `EXIT_ATR_MIN_BARS` bars exist, or when
 * velocity rounds to zero (a book that has not moved) -- both fall through to
 * the TOPIC_TABLE estimator.
 */
export async function computeAtr(ticker: string): Promise<AtrResult | null> {
    const { atrPeriod, atrBarSeconds, atrMinBars } = config.trading.exit;
    const windowMs = atrPeriod * atrBarSeconds * 1000 * 2; // extra headroom for sparse polling
    const samples = await getQuoteSamplesSince(ticker, Date.now() - windowMs);
    const bars = buildBars(samples, atrBarSeconds);

    if (bars.length < atrMinBars) return null;

    let atr = 0;
    for (let i = 0; i < bars.length; i++) {
        const bar = bars[i];
        const prevClose = i > 0 ? bars[i - 1].close : bar.close;
        const trueRange = Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
        atr = i < atrPeriod ? (atr * i + trueRange) / (i + 1) : (atr * (atrPeriod - 1) + trueRange) / atrPeriod;
    }

    const barMinutes = atrBarSeconds / 60;
    const velocityCentsPerMinute = atr / barMinutes;
    if (Math.round(velocityCentsPerMinute) === 0) return null;

    return { atrCents: atr, velocityCentsPerMinute };
}

interface Bar {
    high: number;
    low: number;
    close: number;
}

function buildBars(samples: QuoteSample[], barSeconds: number): Bar[] {
    const barMs = barSeconds * 1000;
    const buckets = new Map<number, number[]>();

    for (const sample of samples) {
        if (sample.yesAskCents === null) continue;
        const bucketKey = Math.floor(sample.tsMs / barMs);
        const bucket = buckets.get(bucketKey) ?? [];
        bucket.push(sample.yesAskCents);
        buckets.set(bucketKey, bucket);
    }

    return Array.from(buckets.keys())
        .sort((a, b) => a - b)
        .map((key) => {
            const prices = buckets.get(key) ?? [];
            return { high: Math.max(...prices), low: Math.min(...prices), close: prices[prices.length - 1] };
        });
}

export interface HorizonEstimate {
    minutes: number;
    source: HorizonSource;
    atrCents: number | null;
}

/**
 * Dispatches to the estimator selected by `EXIT_HORIZON_SYSTEM`, falling
 * through ATR -> TOPIC_TABLE (SURVIVAL is not implemented in v1 and falls
 * through to TOPIC_TABLE too, logged under its own source so it stays
 * distinguishable once it exists).
 */
export async function computeDeterministicHorizon(params: {
    ticker: string;
    entryPriceCents: number;
    fairProbability: number;
    defaultHorizonMinutes: number;
}): Promise<HorizonEstimate> {
    if (config.trading.exit.horizonSystem === HorizonSource.ATR) {
        const atr = await computeAtr(params.ticker);
        if (atr) {
            const edgeCents = Math.abs(params.fairProbability * 100 - params.entryPriceCents);
            const minutes = (config.trading.exit.atrHorizonMultiplier * edgeCents) / atr.velocityCentsPerMinute;
            return { minutes: Math.round(minutes), source: HorizonSource.ATR, atrCents: Math.round(atr.atrCents) };
        }
    }

    return { minutes: params.defaultHorizonMinutes, source: HorizonSource.TOPIC_TABLE, atrCents: null };
}

/**
 * Geometric blend of the model's horizon estimate and the deterministic one,
 * per `EXIT_HORIZON_MODEL_WEIGHT`. `hModel === null` (the model declined to
 * guess) uses the deterministic estimate alone.
 */
export function blendHorizonMinutes(hModel: number | null, hDet: number): number {
    const weight = config.trading.exit.horizonModelWeight;
    if (hModel === null || weight === 0) return hDet;
    return hModel ** weight * hDet ** (1 - weight);
}

/**
 * Clamps the raw horizon to [min, max] and then, unconditionally, to leave
 * `EXIT_CLOSE_BUFFER_MINUTES` before the market closes. Holding into
 * settlement converts a mispricing trade into a bet on the event itself.
 */
export function clampHorizonMinutes(hRaw: number, minutesUntilClose: number): number {
    const { horizonMinMinutes, horizonMaxMinutes, closeBufferMinutes } = config.trading.exit;
    const bounded = Math.min(Math.max(hRaw, horizonMinMinutes), horizonMaxMinutes);
    return Math.min(bounded, minutesUntilClose - closeBufferMinutes);
}

export interface StopPolicy {
    stopDistanceCents: number;
    /** Null when the stop cannot bind on a valid contract price (>= 1c). */
    stopPriceCents: number | null;
}

/**
 * ATR-scaled stop, evaluated later against the held-side bid, never the ask.
 * When ATR is unavailable (the horizon estimator fell through to
 * TOPIC_TABLE), the floor distance is used as a conservative default.
 */
export function computeStopPolicy(entryFillCents: number, atrCents: number | null): StopPolicy {
    const { stopLossAtrMultiplier, stopLossMinCents, stopLossMaxCents } = config.trading.exit;
    const rawDistance = atrCents === null ? stopLossMinCents : stopLossAtrMultiplier * atrCents;
    const stopDistanceCents = Math.round(Math.min(Math.max(rawDistance, stopLossMinCents), stopLossMaxCents));
    const rawStopPrice = entryFillCents - stopDistanceCents;
    return { stopDistanceCents, stopPriceCents: rawStopPrice < 1 ? null : rawStopPrice };
}

/**
 * Target bounded by the model's own fair value: aiming past
 * `fairProbability` is not trading the thesis, it is hoping. Floored by the
 * round-trip fee cost so a "win" never books a net loss.
 */
export function computeTargetPriceCents(params: {
    entryFillCents: number;
    fairProbability: number;
    entryFeeCents: number;
    expectedExitFeeCents: number;
}): number {
    const { takeProfitEdgeFraction, takeProfitMinNetCents } = config.trading.exit;
    const edgeCents = params.fairProbability * 100 - params.entryFillCents;
    const rawTarget = params.entryFillCents + takeProfitEdgeFraction * edgeCents;
    const roundTripCents = params.entryFeeCents + params.expectedExitFeeCents;
    const floor = params.entryFillCents + roundTripCents + takeProfitMinNetCents;
    return Math.round(Math.min(Math.max(Math.max(rawTarget, floor), 1), 99));
}

/** Minutes between now and a market's close time. */
export function minutesUntilClose(closeTimeIso: string): number {
    return (new Date(closeTimeIso).getTime() - Date.now()) / MS_PER_MINUTE;
}
