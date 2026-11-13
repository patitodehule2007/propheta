import { query } from "../../shared/services/db";

export interface TopicMarketMapEntry {
    topic: string;
    defaultHorizonMinutes: number;
    /** How far out a candidate market may close; null falls back to the global horizon. */
    maxCloseHorizonMinutes: number | null;
}

/**
 * Reads the hand-written, human-reviewed topic table.
 * `docs/backend/tradeDecision.md` open decision 4.
 */
export async function getTopicMarketMap(): Promise<TopicMarketMapEntry[]> {
    const rows = await query<{
        topic: string;
        default_horizon_minutes: number;
        max_close_horizon_minutes: number | null;
    }>("SELECT * FROM get_topic_market_map()");
    return rows.map((row) => ({
        topic: row.topic,
        defaultHorizonMinutes: row.default_horizon_minutes,
        maxCloseHorizonMinutes: row.max_close_horizon_minutes
    }));
}

/**
 * Reads every whitelisted series ticker across active topics, deduplicated.
 * The market cache refresh's work list.
 */
export async function getTopicSeriesTickers(): Promise<string[]> {
    const rows = await query<{ series_ticker: string }>("SELECT series_ticker FROM get_topic_series_tickers()");
    return rows.map((row) => row.series_ticker);
}

export interface TopicSeriesCatalogEntry {
    topic: string;
    seriesTicker: string;
    /** Cached Kalshi series title; null until the market cache has fetched the series. */
    seriesTitle: string | null;
}

/**
 * Reads every whitelisted series per active topic, with its cached title.
 * Feeds the classifier's `<tracked_markets>` prompt block.
 * @returns one entry per topic/series pair, ordered by topic then ticker
 */
export async function getTopicSeriesCatalog(): Promise<TopicSeriesCatalogEntry[]> {
    const rows = await query<{ topic: string; series_ticker: string; series_title: string | null }>(
        "SELECT topic, series_ticker, series_title FROM get_topic_series_catalog()"
    );
    return rows.map((row) => ({
        topic: row.topic,
        seriesTicker: row.series_ticker,
        seriesTitle: row.series_title
    }));
}

/**
 * Upserts one cached series row, keyed by series_ticker.
 */
export async function upsertKalshiSeries(params: {
    seriesTicker: string;
    title: string;
    category: string;
    tags: string[];
    volume: number;
    feeType: string;
    feeMultiplier: number;
    additionalProhibitions: string[];
    sourceUpdatedAt: string | null;
}): Promise<{ id: string; seriesTicker: string }> {
    const rows = await query<{ id: string; series_ticker: string }>(
        "SELECT * FROM upsert_kalshi_series($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
            params.seriesTicker,
            params.title,
            params.category,
            JSON.stringify(params.tags),
            params.volume,
            params.feeType,
            params.feeMultiplier,
            JSON.stringify(params.additionalProhibitions),
            params.sourceUpdatedAt
        ]
    );
    const row = rows[0];
    if (!row) throw new Error("upsert_kalshi_series returned no row");
    return { id: row.id, seriesTicker: row.series_ticker };
}

/**
 * Upserts one cached market row, keyed by ticker.
 */
export async function upsertKalshiMarket(params: {
    ticker: string;
    kalshiSeriesId: string;
    eventTicker: string;
    title: string;
    yesSubTitle: string;
    status: string;
    closeTime: string;
    rulesPrimary: string;
    rulesSecondary: string;
    volume24h: number;
    openInterest: number;
    sourceUpdatedAt: string | null;
}): Promise<{ id: string; ticker: string }> {
    const rows = await query<{ id: string; ticker: string }>(
        "SELECT * FROM upsert_kalshi_market($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        [
            params.ticker,
            params.kalshiSeriesId,
            params.eventTicker,
            params.title,
            params.yesSubTitle,
            params.status,
            params.closeTime,
            params.rulesPrimary,
            params.rulesSecondary,
            params.volume24h,
            params.openInterest,
            params.sourceUpdatedAt
        ]
    );
    const row = rows[0];
    if (!row) throw new Error("upsert_kalshi_market returned no row");
    return { id: row.id, ticker: row.ticker };
}

export interface CandidateMarket {
    ticker: string;
    seriesTicker: string;
    title: string;
    yesSubTitle: string;
    closeTime: string;
    rulesPrimary: string;
    rulesSecondary: string;
    volume24h: number;
    openInterest: number;
    feeType: string;
    feeMultiplier: number;
    additionalProhibitions: string[];
}

/**
 * Gate 2 (candidate assembly): topic -> cached open markets, from the
 * pre-built cache only. Markets in `prioritySeries` rank first, then by 24h volume.
 */
export async function getCandidateMarketsByTopic(params: {
    topic: string;
    status: string;
    minCloseTime: string;
    maxCloseTime: string;
    minSeriesVolume: number;
    /** Series tickers to rank ahead of the rest; empty ranks by volume alone. */
    prioritySeries: string[];
    limit: number;
}): Promise<CandidateMarket[]> {
    const rows = await query<{
        ticker: string;
        series_ticker: string;
        title: string;
        yes_sub_title: string;
        close_time: string;
        rules_primary: string;
        rules_secondary: string;
        volume_24h: string;
        open_interest: string;
        fee_type: string;
        fee_multiplier: string;
        additional_prohibitions: string[];
    }>("SELECT * FROM get_candidate_markets_by_topic($1, $2, $3, $4, $5, $6, $7)", [
        params.topic,
        params.status,
        params.minCloseTime,
        params.maxCloseTime,
        params.minSeriesVolume,
        params.prioritySeries,
        params.limit
    ]);
    return rows.map((row) => ({
        ticker: row.ticker,
        seriesTicker: row.series_ticker,
        title: row.title,
        yesSubTitle: row.yes_sub_title,
        closeTime: row.close_time,
        rulesPrimary: row.rules_primary,
        rulesSecondary: row.rules_secondary,
        volume24h: Number(row.volume_24h),
        openInterest: Number(row.open_interest),
        feeType: row.fee_type,
        feeMultiplier: Number(row.fee_multiplier),
        additionalProhibitions: row.additional_prohibitions
    }));
}

export interface TradeProposal {
    id: string;
    ingestedPostId: string;
    topic: string;
    direction: string;
    confidence: number;
    action: string;
    ticker: string | null;
    outcomeSide: string | null;
    fairProbability: number | null;
    conviction: number;
    horizonModelMinutes: number | null;
    noTradeReason: string | null;
    vetoReason: string | null;
    status: string;
    reasoning: string;
    candidateTickers: string[];
    inspectedTickers: string[];
    rejectedCandidates: { ticker: string; reason: string }[];
    createdAt: string;
}

interface TradeProposalRow {
    id: string;
    ingested_post_id: string;
    topic: string;
    direction: string;
    confidence: string;
    action: string;
    ticker: string | null;
    outcome_side: string | null;
    fair_probability: string | null;
    conviction: string;
    horizon_model_minutes: number | null;
    no_trade_reason: string | null;
    veto_reason: string | null;
    status: string;
    reasoning: string;
    candidate_tickers: string[];
    inspected_tickers: string[];
    rejected_candidates: { ticker: string; reason: string }[];
    created_at: string;
}

function mapTradeProposalRow(row: TradeProposalRow): TradeProposal {
    return {
        id: row.id,
        ingestedPostId: row.ingested_post_id,
        topic: row.topic,
        direction: row.direction,
        confidence: Number(row.confidence),
        action: row.action,
        ticker: row.ticker,
        outcomeSide: row.outcome_side,
        fairProbability: row.fair_probability === null ? null : Number(row.fair_probability),
        conviction: Number(row.conviction),
        horizonModelMinutes: row.horizon_model_minutes,
        noTradeReason: row.no_trade_reason,
        vetoReason: row.veto_reason,
        status: row.status,
        reasoning: row.reasoning,
        candidateTickers: row.candidate_tickers,
        inspectedTickers: row.inspected_tickers,
        rejectedCandidates: row.rejected_candidates,
        createdAt: row.created_at
    };
}

/**
 * Persists the selection agent's output (gate 3), before risk validation runs.
 */
export async function insertTradeProposal(params: {
    ingestedPostId: string;
    topic: string;
    direction: string;
    confidence: number;
    action: string;
    ticker: string | null;
    outcomeSide: string | null;
    fairProbability: number | null;
    conviction: number;
    horizonModelMinutes: number | null;
    noTradeReason: string | null;
    status: string;
    reasoning: string;
    candidateTickers: string[];
    inspectedTickers: string[];
    rejectedCandidates: { ticker: string; reason: string }[];
}): Promise<TradeProposal> {
    const rows = await query<TradeProposalRow>(
        "SELECT * FROM insert_trade_proposal($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)",
        [
            params.ingestedPostId,
            params.topic,
            params.direction,
            params.confidence,
            params.action,
            params.ticker,
            params.outcomeSide,
            params.fairProbability,
            params.conviction,
            params.horizonModelMinutes,
            params.noTradeReason,
            null,
            params.status,
            params.reasoning,
            JSON.stringify(params.candidateTickers),
            JSON.stringify(params.inspectedTickers),
            JSON.stringify(params.rejectedCandidates)
        ]
    );
    const row = rows[0];
    if (!row) throw new Error("insert_trade_proposal returned no row");
    return mapTradeProposalRow(row);
}

/**
 * Gate 4 moves a proposal from PROPOSED to REJECTED (with a veto reason) or
 * EXECUTED.
 */
export async function updateTradeProposalStatus(params: {
    id: string;
    status: string;
    vetoReason: string | null;
}): Promise<{ id: string; status: string; vetoReason: string | null }> {
    const rows = await query<{ id: string; status: string; veto_reason: string | null }>(
        "SELECT * FROM update_trade_proposal_status($1, $2, $3)",
        [params.id, params.status, params.vetoReason]
    );
    const row = rows[0];
    if (!row) throw new Error("update_trade_proposal_status returned no row");
    return { id: row.id, status: row.status, vetoReason: row.veto_reason };
}

/**
 * Total entry cost of every open position in a topic, cents. Gate 4's
 * exposure_cap_topic check.
 */
export async function getOpenExposureByTopic(topic: string): Promise<number> {
    const rows = await query<{ topic: string; exposure_cents: string }>(
        "SELECT * FROM get_open_exposure_by_topic($1)",
        [topic]
    );
    return rows[0] ? Number(rows[0].exposure_cents) : 0;
}

export interface OrderRecord {
    id: string;
    tradeProposalId: string;
    clientOrderId: string;
    kalshiOrderId: string | null;
    ticker: string;
    outcomeSide: string;
    limitPriceCents: number;
    contracts: number;
    status: string;
    isDryRun: boolean;
    tsMs: number | null;
    createdAt: string;
}

interface OrderRow {
    id: string;
    trade_proposal_id: string;
    client_order_id: string;
    kalshi_order_id: string | null;
    ticker: string;
    outcome_side: string;
    limit_price_cents: number;
    contracts: number;
    status: string;
    is_dry_run: boolean;
    ts_ms: string | null;
    created_at: string;
}

function mapOrderRow(row: OrderRow): OrderRecord {
    return {
        id: row.id,
        tradeProposalId: row.trade_proposal_id,
        clientOrderId: row.client_order_id,
        kalshiOrderId: row.kalshi_order_id,
        ticker: row.ticker,
        outcomeSide: row.outcome_side,
        limitPriceCents: row.limit_price_cents,
        contracts: row.contracts,
        status: row.status,
        isDryRun: row.is_dry_run,
        tsMs: row.ts_ms === null ? null : Number(row.ts_ms),
        createdAt: row.created_at
    };
}

/**
 * Mints the order row. Returns null when client_order_id already existed
 * (a retried call after a network timeout) -- the caller treats that as
 * idempotent success, never as an error.
 */
export async function insertOrder(params: {
    tradeProposalId: string;
    clientOrderId: string;
    kalshiOrderId: string | null;
    ticker: string;
    outcomeSide: string;
    limitPriceCents: number;
    contracts: number;
    status: string;
    isDryRun: boolean;
    tsMs: number | null;
}): Promise<OrderRecord | null> {
    const rows = await query<OrderRow>("SELECT * FROM insert_order($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", [
        params.tradeProposalId,
        params.clientOrderId,
        params.kalshiOrderId,
        params.ticker,
        params.outcomeSide,
        params.limitPriceCents,
        params.contracts,
        params.status,
        params.isDryRun,
        params.tsMs
    ]);
    const row = rows[0];
    return row ? mapOrderRow(row) : null;
}

/**
 * Fills in kalshi_order_id/status/ts_ms once the exchange responds. Returns
 * null when the client_order_id has no matching row.
 */
export async function updateOrderAfterSubmit(params: {
    clientOrderId: string;
    kalshiOrderId: string | null;
    status: string;
    tsMs: number | null;
}): Promise<{ id: string; clientOrderId: string; kalshiOrderId: string | null; status: string } | null> {
    const rows = await query<{ id: string; client_order_id: string; kalshi_order_id: string | null; status: string }>(
        "SELECT * FROM update_order_after_submit($1, $2, $3, $4)",
        [params.clientOrderId, params.kalshiOrderId, params.status, params.tsMs]
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, clientOrderId: row.client_order_id, kalshiOrderId: row.kalshi_order_id, status: row.status };
}

export interface Position {
    id: string;
    orderId: string;
    tradeProposalId: string;
    topic: string;
    ticker: string;
    outcomeSide: string;
    contracts: number;
    entryFillCents: number;
    entryFeeCents: number;
    deadlineAt: string;
    stopPriceCents: number | null;
    targetPriceCents: number;
    horizonSource: string;
    openedAt: string;
    isDryRun: boolean;
}

interface PositionRow {
    id: string;
    order_id: string;
    trade_proposal_id: string;
    topic: string;
    ticker: string;
    outcome_side: string;
    contracts: number;
    entry_fill_cents: number;
    entry_fee_cents: number;
    deadline_at: string;
    stop_price_cents: number | null;
    target_price_cents: number;
    horizon_source: string;
    opened_at: string;
    is_dry_run: boolean;
}

function mapPositionRow(row: PositionRow): Position {
    return {
        id: row.id,
        orderId: row.order_id,
        tradeProposalId: row.trade_proposal_id,
        topic: row.topic,
        ticker: row.ticker,
        outcomeSide: row.outcome_side,
        contracts: row.contracts,
        entryFillCents: row.entry_fill_cents,
        entryFeeCents: row.entry_fee_cents,
        deadlineAt: row.deadline_at,
        stopPriceCents: row.stop_price_cents,
        targetPriceCents: row.target_price_cents,
        horizonSource: row.horizon_source,
        openedAt: row.opened_at,
        isDryRun: row.is_dry_run
    };
}

/**
 * Persists the exit policy in the same transaction as the order, before
 * anything (outside dry-run) goes over the wire.
 */
export async function insertPosition(params: {
    orderId: string;
    tradeProposalId: string;
    topic: string;
    ticker: string;
    outcomeSide: string;
    contracts: number;
    entryFillCents: number;
    entryFeeCents: number;
    deadlineAt: string;
    stopPriceCents: number | null;
    targetPriceCents: number;
    horizonSource: string;
    horizonModelMinutes: number | null;
    horizonDeterministicMinutes: number | null;
    atrCents: number | null;
    openedAt: string;
    isDryRun: boolean;
}): Promise<Position> {
    const rows = await query<PositionRow>(
        "SELECT * FROM insert_position($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)",
        [
            params.orderId,
            params.tradeProposalId,
            params.topic,
            params.ticker,
            params.outcomeSide,
            params.contracts,
            params.entryFillCents,
            params.entryFeeCents,
            params.deadlineAt,
            params.stopPriceCents,
            params.targetPriceCents,
            params.horizonSource,
            params.horizonModelMinutes,
            params.horizonDeterministicMinutes,
            params.atrCents,
            params.openedAt,
            params.isDryRun
        ]
    );
    const row = rows[0];
    if (!row) throw new Error("insert_position returned no row");
    return mapPositionRow(row);
}

export interface OpenPosition extends Position {
    peakFavourableCents: number | null;
}

/**
 * Every position not yet closed. Read on exit-supervisor startup to rebuild
 * its in-memory deadline sorted set and ticker watch list.
 */
export async function getOpenPositions(): Promise<OpenPosition[]> {
    const rows = await query<PositionRow & { peak_favourable_cents: number | null }>(
        "SELECT * FROM get_open_positions()"
    );
    return rows.map((row) => ({ ...mapPositionRow(row), peakFavourableCents: row.peak_favourable_cents }));
}

export interface PositionDueForExit {
    id: string;
    ticker: string;
    outcomeSide: string;
    contracts: number;
    entryFillCents: number;
    entryFeeCents: number;
    deadlineAt: string;
    isDryRun: boolean;
}

/**
 * Positions past their deadline as of `now`. Decides nothing -- the exit
 * supervisor applies precedence and computes P&L.
 */
export async function getPositionsDueForExit(now: string): Promise<PositionDueForExit[]> {
    const rows = await query<{
        id: string;
        ticker: string;
        outcome_side: string;
        contracts: number;
        entry_fill_cents: number;
        entry_fee_cents: number;
        deadline_at: string;
        is_dry_run: boolean;
    }>("SELECT * FROM get_positions_due_for_exit($1)", [now]);
    return rows.map((row) => ({
        id: row.id,
        ticker: row.ticker,
        outcomeSide: row.outcome_side,
        contracts: row.contracts,
        entryFillCents: row.entry_fill_cents,
        entryFeeCents: row.entry_fee_cents,
        deadlineAt: row.deadline_at,
        isDryRun: row.is_dry_run
    }));
}

/**
 * Sets the recorded high-water mark. The caller computes the greatest of the
 * current value and the new tick before calling.
 */
export async function updatePositionPeakFavourable(positionId: string, peakFavourableCents: number): Promise<void> {
    await query("SELECT * FROM update_position_peak_favourable($1, $2)", [positionId, peakFavourableCents]);
}

/**
 * Closes a position. Returns null when it was already closed (a race between
 * two exit triggers on the same tick) -- the caller treats that as a no-op,
 * never as an error.
 */
export async function closePosition(params: {
    positionId: string;
    closedAt: string;
    exitReason: string;
    exitPriceCents: number | null;
    realizedPnlCents: number | null;
}): Promise<{ id: string; exitReason: string } | null> {
    const rows = await query<{
        id: string;
        closed_at: string;
        exit_reason: string;
        exit_price_cents: number | null;
        realized_pnl_cents: number | null;
    }>("SELECT * FROM close_position($1, $2, $3, $4, $5)", [
        params.positionId,
        params.closedAt,
        params.exitReason,
        params.exitPriceCents,
        params.realizedPnlCents
    ]);
    const row = rows[0];
    return row ? { id: row.id, exitReason: row.exit_reason } : null;
}

/**
 * Orders placed since `since`. Gate 1's order_rate_limit guard.
 */
export async function countRecentOrders(since: string): Promise<number> {
    const rows = await query<{ order_count: string }>("SELECT * FROM count_recent_orders($1)", [since]);
    return rows[0] ? Number(rows[0].order_count) : 0;
}

/**
 * Realized P&L (cents, may be negative) closed since `since`. Gate 1's
 * daily-loss kill switch.
 */
export async function getRealizedPnlSince(since: string): Promise<number> {
    const rows = await query<{ realized_pnl_cents: string }>("SELECT * FROM get_realized_pnl_since($1)", [since]);
    return rows[0] ? Number(rows[0].realized_pnl_cents) : 0;
}

export interface KalshiMarketRules {
    ticker: string;
    seriesTicker: string;
    title: string;
    yesSubTitle: string;
    status: string;
    closeTime: string;
    rulesPrimary: string;
    rulesSecondary: string;
    additionalProhibitions: string[];
    feeType: string;
    feeMultiplier: number;
}

/**
 * Backs the get_market_rules tool.
 */
export async function getKalshiMarketByTicker(ticker: string): Promise<KalshiMarketRules | null> {
    const rows = await query<{
        ticker: string;
        series_ticker: string;
        title: string;
        yes_sub_title: string;
        status: string;
        close_time: string;
        rules_primary: string;
        rules_secondary: string;
        additional_prohibitions: string[];
        fee_type: string;
        fee_multiplier: string;
    }>("SELECT * FROM get_kalshi_market_by_ticker($1)", [ticker]);
    const row = rows[0];
    if (!row) return null;
    return {
        ticker: row.ticker,
        seriesTicker: row.series_ticker,
        title: row.title,
        yesSubTitle: row.yes_sub_title,
        status: row.status,
        closeTime: row.close_time,
        rulesPrimary: row.rules_primary,
        rulesSecondary: row.rules_secondary,
        additionalProhibitions: row.additional_prohibitions,
        feeType: row.fee_type,
        feeMultiplier: Number(row.fee_multiplier)
    };
}

export interface KalshiMarketFeeInfo {
    ticker: string;
    status: string;
    closeTime: string;
    feeType: string;
    feeMultiplier: number;
}

/**
 * Backs the get_market_quote tool's fee/status half; live prices come from
 * the Redis quote cache, not from here.
 */
export async function getKalshiMarketsByTickers(tickers: string[]): Promise<KalshiMarketFeeInfo[]> {
    const rows = await query<{
        ticker: string;
        status: string;
        close_time: string;
        fee_type: string;
        fee_multiplier: string;
    }>("SELECT * FROM get_kalshi_markets_by_tickers($1)", [tickers]);
    return rows.map((row) => ({
        ticker: row.ticker,
        status: row.status,
        closeTime: row.close_time,
        feeType: row.fee_type,
        feeMultiplier: Number(row.fee_multiplier)
    }));
}

export interface KalshiMarketSearchResult {
    ticker: string;
    seriesTicker: string;
    title: string;
    yesSubTitle: string;
    closeTime: string;
    volume24h: number;
}

/**
 * Backs the find_markets tool escape hatch.
 */
export async function searchKalshiMarkets(params: {
    status: string;
    minCloseTime: string;
    tags: string[] | null;
    seriesTicker: string | null;
    queryText: string | null;
    limit: number;
}): Promise<KalshiMarketSearchResult[]> {
    const rows = await query<{
        ticker: string;
        series_ticker: string;
        title: string;
        yes_sub_title: string;
        close_time: string;
        volume_24h: string;
    }>("SELECT * FROM search_kalshi_markets($1, $2, $3, $4, $5, $6)", [
        params.status,
        params.minCloseTime,
        params.tags ? JSON.stringify(params.tags) : null,
        params.seriesTicker,
        params.queryText,
        params.limit
    ]);
    return rows.map((row) => ({
        ticker: row.ticker,
        seriesTicker: row.series_ticker,
        title: row.title,
        yesSubTitle: row.yes_sub_title,
        closeTime: row.close_time,
        volume24h: Number(row.volume_24h)
    }));
}

/**
 * Every currently cached open market ticker, ranked by liquidity. The quote
 * poller's watch list.
 */
export async function getOpenMarketTickers(params: {
    status: string;
    minCloseTime: string;
    limit: number;
}): Promise<string[]> {
    const rows = await query<{ ticker: string }>("SELECT * FROM get_open_market_tickers($1, $2, $3)", [
        params.status,
        params.minCloseTime,
        params.limit
    ]);
    return rows.map((row) => row.ticker);
}

export interface RecentClassification {
    platformPostId: string;
    rawText: string;
    topic: string;
    direction: string;
    confidence: number;
    createdAt: string;
}

/**
 * Backs both the pre-gate's novelty heuristic and the get_author_recent_posts
 * tool.
 */
export async function getRecentClassificationsByHandle(params: {
    handle: string;
    topic: string | null;
    since: string;
    limit: number;
}): Promise<RecentClassification[]> {
    const rows = await query<{
        platform_post_id: string;
        raw_text: string;
        topic: string;
        direction: string;
        confidence: string;
        created_at: string;
    }>("SELECT * FROM get_recent_classifications_by_handle($1, $2, $3, $4)", [
        params.handle,
        params.topic,
        params.since,
        params.limit
    ]);
    return rows.map((row) => ({
        platformPostId: row.platform_post_id,
        rawText: row.raw_text,
        topic: row.topic,
        direction: row.direction,
        confidence: Number(row.confidence),
        createdAt: row.created_at
    }));
}
