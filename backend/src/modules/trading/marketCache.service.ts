import { config } from "../../config";
import {
    getTopicMarketMap,
    upsertKalshiMarket,
    upsertKalshiSeries
} from "../../repositories/postgres/trading.repository";
import { logger } from "../../shared/services/logger";
import { kalshiService } from "../kalshi";

const MARKET_STATUS_OPEN = "open";
const MAX_MARKETS_PER_CALL = 1000;

let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Refreshes the `kalshi_series` / `kalshi_markets` cache for every series the
 * `topic_market_map`'s tags resolve to
 * (`docs/projectDefenition/initial_investigation.md` §5.3: topic -> tags ->
 * series -> markets). Candidate assembly (gate 2) reads only this cache,
 * never Kalshi directly, so a stale cache is a stale candidate set, not a
 * missing one.
 *
 * Full refresh per cycle for v1. The incremental `min_updated_ts` path is a
 * documented follow-up: §5.3 says it is incompatible with most other filters,
 * and that combination needs verifying against the live API before relying
 * on it.
 *
 * No-ops (with a single warn) when Kalshi credentials are not configured --
 * empty in development, same pattern as `config.anthropic.apiKey` in
 * `modules/agent/agent.service.ts` -- rather than attempting and logging a
 * failure per tag.
 */
export async function refreshMarketCache(): Promise<void> {
    if (!config.kalshi.apiKeyId || !config.kalshi.privateKey) {
        logger.warn("Kalshi API credentials not configured, skipping market cache refresh");
        return;
    }

    const topicMap = await getTopicMarketMap();
    const tags = Array.from(new Set(topicMap.flatMap((entry) => entry.kalshiTags)));

    for (const tag of tags) {
        try {
            await refreshSeriesForTag(tag);
        } catch (err) {
            logger.error({ err, tag }, "Failed to refresh market cache for tag");
        }
    }
}

async function refreshSeriesForTag(tag: string): Promise<void> {
    const { series } = await kalshiService.getSeriesList({ tags: tag, include_volume: true });
    if (!series) {
        logger.debug({ tag }, "No Kalshi series match tag");
        return;
    }

    for (const oneSeries of series) {
        const { id: kalshiSeriesId } = await upsertKalshiSeries({
            seriesTicker: oneSeries.ticker,
            title: oneSeries.title,
            category: oneSeries.category,
            tags: oneSeries.tags,
            volume: oneSeries.volume ?? 0,
            feeType: oneSeries.fee_type,
            feeMultiplier: oneSeries.fee_multiplier,
            additionalProhibitions: oneSeries.additional_prohibitions ?? [],
            sourceUpdatedAt: oneSeries.last_updated_ts ?? null
        });

        await refreshMarketsForSeries(oneSeries.ticker, kalshiSeriesId);
    }
}

async function refreshMarketsForSeries(seriesTicker: string, kalshiSeriesId: string): Promise<void> {
    const { markets } = await kalshiService.getMarkets({
        series_ticker: seriesTicker,
        status: MARKET_STATUS_OPEN,
        limit: MAX_MARKETS_PER_CALL
    });

    for (const market of markets) {
        await upsertKalshiMarket({
            ticker: market.ticker,
            kalshiSeriesId,
            eventTicker: market.event_ticker,
            // Market objects carry no title of their own -- yes_sub_title is
            // the closest field the API exposes for display purposes.
            title: market.yes_sub_title,
            yesSubTitle: market.yes_sub_title,
            status: market.status,
            closeTime: market.close_time,
            rulesPrimary: market.rules_primary,
            rulesSecondary: market.rules_secondary,
            volume24h: Number(market.volume_24h_fp),
            openInterest: Number(market.open_interest_fp),
            sourceUpdatedAt: market.updated_time
        });
    }
}

/**
 * Starts the periodic cache refresh on `config.trading.marketCacheRefreshMs`.
 * Infrastructure cadence, not business flow control -- the interval only
 * decides how fresh the cache is, never what a gate does with a candidate.
 */
export function startMarketCacheRefresh(): void {
    if (refreshTimer) return;

    refreshTimer = setInterval(() => {
        void refreshMarketCache().catch((err) => {
            logger.error({ err }, "Market cache refresh cycle failed");
        });
    }, config.trading.marketCacheRefreshMs);

    logger.info({ intervalMs: config.trading.marketCacheRefreshMs }, "Market cache refresh started");
}

/** Stops the periodic cache refresh. Used by tests and graceful shutdown. */
export function stopMarketCacheRefresh(): void {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
}
