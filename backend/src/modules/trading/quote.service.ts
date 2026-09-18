import { getLatestQuote, QuoteSample } from "../../repositories/redis/marketQuote.repository";
import { kalshiService } from "../kalshi";
import { deriveQuote } from "./pricing";

/**
 * Reads the latest polled quote sample for a ticker, falling back to one
 * direct Kalshi order book read when the poller has not reached it yet (a
 * market just added to the cache, or between poll cycles). Shared by
 * candidate assembly (gate 2) and the `get_market_quote` tool so both read
 * prices the same way.
 */
export async function getLiveOrCachedQuote(ticker: string): Promise<QuoteSample> {
    const cached = await getLatestQuote(ticker);
    if (cached) return cached;

    const { orderbook_fp: orderbook } = await kalshiService.getMarketOrderbook(ticker);
    return { tsMs: Date.now(), ...deriveQuote(orderbook) };
}
