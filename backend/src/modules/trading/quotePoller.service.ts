import { config } from "../../config";
import { getOpenMarketTickers } from "../../repositories/postgres/trading.repository";
import { recordQuoteSample } from "../../repositories/redis/marketQuote.repository";
import { logger } from "../../shared/services/logger";
import { KALSHI_MARKET_STATUS, kalshiService } from "../kalshi";
import { deriveQuote } from "./pricing";

/** Kalshi's batch orderbook endpoint accepts at most 100 tickers per call. */
const MAX_TICKERS_PER_BATCH = 100;
const MAX_WATCHED_TICKERS = 500;

let pollTimer: ReturnType<typeof setInterval> | null = null;

function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

/**
 * One polling cycle: reads every currently watched ticker, fetches their
 * order books in batches of up to 100, and records a quote sample for each.
 * REST-polling quote feed for v1 (`docs/backend/tradeDecision.md`'s
 * "Quote feed" decision) -- the WebSocket path (§5.6) is phase two, so
 * price-triggered exits fire on this poll's cadence, not on a tick.
 */
export async function pollQuotesOnce(): Promise<void> {
    if (!config.kalshi.apiKeyId || !config.kalshi.privateKey) return;

    const tickers = await getOpenMarketTickers({
        status: KALSHI_MARKET_STATUS.ACTIVE,
        minCloseTime: new Date().toISOString(),
        limit: MAX_WATCHED_TICKERS
    });
    if (tickers.length === 0) return;

    for (const batch of chunk(tickers, MAX_TICKERS_PER_BATCH)) {
        try {
            const { orderbooks } = await kalshiService.getMarketOrderbooks({ tickers: batch });
            const tsMs = Date.now();

            await Promise.all(
                orderbooks.map((entry) => {
                    const quote = deriveQuote(entry.orderbook_fp);
                    return recordQuoteSample(entry.ticker, { tsMs, ...quote });
                })
            );
        } catch (err) {
            logger.error({ err, batchSize: batch.length }, "Quote poll batch failed");
        }
    }
}

/**
 * Starts the polling loop on `config.trading.quotePollIntervalMs`, guarded by
 * `config.trading.quotePollEnabled`. Infrastructure cadence, not business flow
 * control -- the interval only decides how often the cache is refreshed, not
 * what happens with a quote once read.
 */
export function startQuotePoller(): void {
    if (!config.trading.quotePollEnabled || pollTimer) return;

    pollTimer = setInterval(() => {
        void pollQuotesOnce().catch((err) => {
            logger.error({ err }, "Quote poll cycle failed");
        });
    }, config.trading.quotePollIntervalMs);

    logger.info({ intervalMs: config.trading.quotePollIntervalMs }, "Quote poller started");
}

/** Stops the polling loop. Used by tests and graceful shutdown. */
export function stopQuotePoller(): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
}
