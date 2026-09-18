import { config } from "../../config";
import { logger } from "../../shared/services/logger";
import { redisClient } from "./redisClient";

const QUOTE_KEY_PREFIX = "quote:v1:";

export interface QuoteSample {
    tsMs: number;
    yesBidCents: number | null;
    yesAskCents: number | null;
    noBidCents: number | null;
    noAskCents: number | null;
    spreadCents: number | null;
    topOfBookContracts: number | null;
}

function quoteKey(ticker: string): string {
    return QUOTE_KEY_PREFIX + ticker;
}

/**
 * Appends one quote sample to a ticker's rolling history and trims entries
 * older than `config.trading.quoteSampleTtlSeconds`. A Redis sorted set
 * scored by `tsMs`, written continuously by the quote poller and read
 * backwards for the pre-signal price (`moveSinceSignalCents`) and for the
 * ATR estimator's bars. Degrades silently (warn-logged) on a Redis failure,
 * the same posture as `scrapedPage.repository.ts` -- a missed sample loses
 * precision, it must never fail the pipeline.
 */
export async function recordQuoteSample(ticker: string, sample: QuoteSample): Promise<void> {
    try {
        const key = quoteKey(ticker);
        const cutoff = sample.tsMs - config.trading.quoteSampleTtlSeconds * 1000;
        await redisClient
            .multi()
            .zadd(key, sample.tsMs, JSON.stringify(sample))
            .zremrangebyscore(key, "-inf", cutoff)
            .expire(key, config.trading.quoteSampleTtlSeconds)
            .exec();
    } catch (err) {
        logger.warn({ err, ticker }, "Failed to record quote sample, continuing without it");
    }
}

/**
 * Reads the most recent quote sample for a ticker, or null when none exists
 * yet (a market the poller only just started watching).
 */
export async function getLatestQuote(ticker: string): Promise<QuoteSample | null> {
    const raw = await redisClient.zrevrange(quoteKey(ticker), 0, 0);
    return raw[0] ? (JSON.parse(raw[0]) as QuoteSample) : null;
}

/**
 * Reads the most recent quote sample at or before `atMs` -- the pre-signal
 * price a `moveSinceSignalCents` comparison needs. Null when no sample that
 * old exists (the ticker was not yet being watched at that time).
 */
export async function getQuoteAt(ticker: string, atMs: number): Promise<QuoteSample | null> {
    const raw = await redisClient.zrevrangebyscore(quoteKey(ticker), atMs, "-inf", "LIMIT", 0, 1);
    return raw[0] ? (JSON.parse(raw[0]) as QuoteSample) : null;
}

/**
 * Reads every sample recorded since `sinceMs`, oldest first -- the ATR
 * estimator's bar source and the `get_price_history` tool's backing data.
 */
export async function getQuoteSamplesSince(ticker: string, sinceMs: number): Promise<QuoteSample[]> {
    const raw = await redisClient.zrangebyscore(quoteKey(ticker), sinceMs, "+inf");
    return raw.map((entry) => JSON.parse(entry) as QuoteSample);
}
