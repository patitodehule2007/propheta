/**
 * Request and response shapes for the Kalshi Trade API v2.
 *
 * Property names are `snake_case` because they mirror the wire format exactly;
 * this module is a transport wrapper and does no renaming. Mapping to domain
 * models belongs in the services that consume it.
 *
 * https://docs.kalshi.com/api-reference
 */

/**
 * Fixed-point US dollar amount as a string (e.g. `"0.5600"`). Requests accept
 * 2-4 decimals, responses emit up to 6. Never parse these into floats for
 * money arithmetic.
 */
export type FixedPointDollars = string;

/**
 * Fixed-point contract count as a string (e.g. `"10.00"`). Fractional
 * contracts are supported down to a granularity of 0.01.
 */
export type FixedPointCount = string;

/** Identifier for an exchange shard. */
export type ExchangeIndex = number;

/**
 * Side of the book. For event markets this refers to the YES leg only: `bid`
 * buys YES, `ask` sells YES.
 */
export type BookSide = "bid" | "ask";

/** Directional exposure a fill or order produces. */
export type OutcomeSide = "yes" | "no";

export type MarketStatusFilter = "unopened" | "open" | "paused" | "closed" | "settled";

export type EventStatusFilter = "unopened" | "open" | "closed" | "settled";

export type MarketLifecycleStatus =
    "initialized" | "inactive" | "active" | "closed" | "determined" | "disputed" | "amended" | "finalized";

export type OrderStatus = "resting" | "canceled" | "executed";

export type OrderType = "limit" | "market";

export type TimeInForce = "fill_or_kill" | "good_till_canceled" | "immediate_or_cancel";

export type SelfTradePreventionType = "taker_at_cross" | "maker";

export type MveFilter = "only" | "exclude";

/** How a market's strike is defined and evaluated. */
export type StrikeType =
    "greater" | "greater_or_equal" | "less" | "less_or_equal" | "between" | "functional" | "custom" | "structured";

/** Params every cursor-paginated Kalshi list endpoint accepts. */
export interface CursorPaginationParams {
    limit?: number;
    cursor?: string;
}

// --- Exchange -------------------------------------------------------------

export interface ExchangeIndexStatus {
    exchange_index: ExchangeIndex;
    description: string;
    exchange_active: boolean;
    trading_active: boolean;
    intra_exchange_transfers_active?: boolean;
}

export interface ExchangeStatus {
    exchange_active: boolean;
    trading_active: boolean;
    intra_exchange_transfers_active?: boolean;
    exchange_estimated_resume_time?: string | null;
    exchange_index_statuses?: ExchangeIndexStatus[];
}

/** Opening and closing time of one trading session, in ET, format `HH:MM`. */
export interface DailySchedule {
    open_time: string;
    close_time: string;
}

export interface WeeklySchedule {
    start_time: string;
    end_time: string;
    monday: DailySchedule[];
    tuesday: DailySchedule[];
    wednesday: DailySchedule[];
    thursday: DailySchedule[];
    friday: DailySchedule[];
    saturday: DailySchedule[];
    sunday: DailySchedule[];
}

export interface MaintenanceWindow {
    start_datetime: string;
    end_datetime: string;
}

export interface ExchangeSchedule {
    standard_hours: WeeklySchedule[];
    maintenance_windows: MaintenanceWindow[];
}

export interface GetExchangeScheduleResponse {
    schedule: ExchangeSchedule;
}

// --- Markets --------------------------------------------------------------

/** Valid price range for orders on a market; shape varies by price level structure. */
export type PriceRange = Record<string, unknown>;

export interface Market {
    ticker: string;
    event_ticker: string;
    market_type: "binary" | "scalar";
    yes_sub_title: string;
    no_sub_title: string;
    created_time: string;
    updated_time: string;
    open_time: string;
    close_time: string;
    expected_expiration_time?: string | null;
    latest_expiration_time: string;
    settlement_timer_seconds: number;
    status: MarketLifecycleStatus;
    notional_value_dollars: FixedPointDollars;
    yes_bid_dollars: FixedPointDollars;
    yes_ask_dollars: FixedPointDollars;
    no_bid_dollars: FixedPointDollars;
    no_ask_dollars: FixedPointDollars;
    yes_bid_size_fp: FixedPointCount;
    yes_ask_size_fp: FixedPointCount;
    last_price_dollars: FixedPointDollars;
    previous_yes_bid_dollars: FixedPointDollars;
    previous_yes_ask_dollars: FixedPointDollars;
    previous_price_dollars: FixedPointDollars;
    volume_fp: FixedPointCount;
    volume_24h_fp: FixedPointCount;
    open_interest_fp: FixedPointCount;
    result: "yes" | "no" | "scalar" | "";
    can_close_early: boolean;
    expiration_value: string;
    rules_primary: string;
    rules_secondary: string;
    price_level_structure: string;
    price_ranges: PriceRange[];
    settlement_value_dollars?: FixedPointDollars | null;
    settlement_ts?: string | null;
    occurrence_datetime?: string | null;
    fee_waiver_expiration_time?: string | null;
    early_close_condition?: string | null;
    strike_type?: StrikeType;
    floor_strike?: number | null;
    cap_strike?: number | null;
    functional_strike?: string | null;
    custom_strike?: Record<string, unknown> | null;
    mve_collection_ticker?: string;
    primary_participant_key?: string | null;
    is_provisional?: boolean;
    exchange_index?: ExchangeIndex;
}

export interface GetMarketsParams extends CursorPaginationParams {
    event_ticker?: string;
    series_ticker?: string;
    tickers?: string;
    status?: MarketStatusFilter;
    min_created_ts?: number;
    max_created_ts?: number;
    min_updated_ts?: number;
    min_close_ts?: number;
    max_close_ts?: number;
    min_settled_ts?: number;
    max_settled_ts?: number;
    mve_filter?: MveFilter;
}

export interface GetMarketsResponse {
    markets: Market[];
    cursor: string;
}

export interface GetMarketResponse {
    market: Market;
}

/**
 * One order book level as `[price_dollars, contract_count]`, both fixed-point
 * strings. The second element is a quantity, not a price.
 */
export type PriceLevel = [FixedPointDollars, FixedPointCount];

export interface Orderbook {
    yes_dollars: PriceLevel[];
    no_dollars: PriceLevel[];
}

export interface GetMarketOrderbookParams {
    /** 1-100 levels; 0 or negative returns every level. */
    depth?: number;
}

export interface GetMarketOrderbookResponse {
    orderbook_fp: Orderbook;
}

export interface Trade {
    trade_id: string;
    ticker: string;
    count_fp: FixedPointCount;
    yes_price_dollars: FixedPointDollars;
    no_price_dollars: FixedPointDollars;
    taker_outcome_side: OutcomeSide;
    taker_book_side: BookSide;
    created_time: string;
    is_block_trade?: boolean;
}

export interface GetTradesParams extends CursorPaginationParams {
    ticker?: string;
    min_ts?: number;
    max_ts?: number;
    is_block_trade?: boolean;
}

export interface GetTradesResponse {
    trades: Trade[];
    cursor: string;
}

/**
 * One ticker's orderbook in a batch response, keyed by the request order.
 */
export interface TickerOrderbook {
    ticker: string;
    orderbook_fp: Orderbook;
}

export interface GetMarketOrderbooksParams {
    /** Comma-separated tickers, up to 100 per call. */
    tickers: string;
    depth?: number;
}

export interface GetMarketOrderbooksResponse {
    orderbooks: TickerOrderbook[];
}

// --- Series -----------------------------------------------------------------

/**
 * How a series computes its per-contract fee.
 * `quadratic` -- 0.07 x C x P x (1-P), rounded up to the cent (the default).
 * `quadratic_with_maker_fees` -- the same formula, plus a maker-side fee.
 * `flat` -- a fixed schedule, independent of price.
 * Never assume a value: always read a series' own fee_type/fee_multiplier.
 */
export type FeeType = "quadratic" | "quadratic_with_maker_fees" | "flat";

export interface Series {
    ticker: string;
    frequency: string;
    title: string;
    category: string;
    tags: string[];
    settlement_sources: SettlementSource[];
    contract_url?: string;
    fee_type: FeeType;
    fee_multiplier: number;
    /** Extra trading restrictions specific to this series -- read before automating on it. */
    additional_prohibitions?: string[];
    product_metadata?: Record<string, unknown> | null;
    volume?: number;
    volume_24h?: number;
    last_updated_ts?: string;
}

export interface GetSeriesListParams {
    category?: string;
    /** Comma-separated tags, not space-separated -- a documented Kalshi trap. */
    tags?: string;
    include_volume?: boolean;
    min_updated_ts?: number;
    include_product_metadata?: boolean;
}

export interface GetSeriesListResponse {
    /** Kalshi returns `null`, not `[]`, when no series matches the filter. */
    series: Series[] | null;
}

export interface GetSeriesResponse {
    series: Series;
}

/**
 * Map of series categories to the tag vocabulary Kalshi actually uses.
 * Refreshed periodically (daily) and used to build the topic -> tags mapping
 * in `topic_market_map`; not called on the trading critical path.
 */
export interface GetTagsByCategoriesResponse {
    categories: Record<string, string[]>;
}

export interface FeeChange {
    series_ticker: string;
    fee_type: FeeType;
    fee_multiplier: number;
    effective_ts: string;
    is_historical: boolean;
}

export interface GetSeriesFeeChangesParams {
    series_ticker?: string;
    show_historical?: boolean;
}

export interface GetSeriesFeeChangesResponse {
    fee_changes: FeeChange[];
}

// --- Events ---------------------------------------------------------------

/** Official source used to determine the markets in an event. */
export type SettlementSource = Record<string, unknown>;

export interface EventData {
    event_ticker: string;
    series_ticker: string;
    sub_title: string;
    title: string;
    collateral_return_type: string;
    mutually_exclusive: boolean;
    available_on_brokers: boolean;
    settlement_sources: SettlementSource[] | null;
    strike_date?: string | null;
    strike_period?: string | null;
    /** Only populated when `with_nested_markets=true`. */
    markets?: Market[];
    product_metadata?: Record<string, unknown> | null;
    last_updated_ts?: string;
    fee_type_override?: string | null;
    fee_multiplier_override?: number | null;
    exchange_index?: ExchangeIndex;
}

export interface GetEventsParams extends CursorPaginationParams {
    with_nested_markets?: boolean;
    with_milestones?: boolean;
    status?: EventStatusFilter;
    series_ticker?: string;
    event_tickers?: string;
    min_close_ts?: number;
}

export interface GetEventsResponse {
    events: EventData[];
    cursor: string;
}

export interface GetEventParams {
    with_nested_markets?: boolean;
}

export interface GetEventResponse {
    event: EventData;
    /** Deprecated by Kalshi in favour of `event.markets`. */
    markets: Market[];
}

// --- Portfolio ------------------------------------------------------------

export interface IndexedBalance {
    exchange_index: ExchangeIndex;
    balance: FixedPointDollars;
}

export interface GetBalanceParams {
    subaccount?: number;
    exchange_index?: ExchangeIndex;
}

export interface GetBalanceResponse {
    /** Available balance in cents. */
    balance: number;
    balance_dollars: FixedPointDollars;
    /** Portfolio value in cents. */
    portfolio_value: number;
    updated_ts: number;
    balance_breakdown?: IndexedBalance[];
}

export interface MarketPosition {
    ticker: string;
    exchange_index: ExchangeIndex;
    total_traded_dollars: FixedPointDollars;
    /** Negative means NO contracts, positive means YES contracts. */
    position_fp: FixedPointCount;
    market_exposure_dollars: FixedPointDollars;
    realized_pnl_dollars: FixedPointDollars;
    fees_paid_dollars: FixedPointDollars;
    last_updated_ts: string;
}

export interface EventPosition {
    event_ticker: string;
    total_cost_dollars: FixedPointDollars;
    total_cost_shares_fp: FixedPointCount;
    event_exposure_dollars: FixedPointDollars;
    realized_pnl_dollars: FixedPointDollars;
    fees_paid_dollars: FixedPointDollars;
}

export interface GetPositionsParams extends CursorPaginationParams {
    /** Comma-separated list of `position` and/or `total_traded`. */
    count_filter?: string;
    ticker?: string;
    event_ticker?: string;
    subaccount?: number;
    exchange_index?: ExchangeIndex;
}

export interface GetPositionsResponse {
    market_positions: MarketPosition[];
    event_positions: EventPosition[];
    cursor?: string;
}

export interface Fill {
    fill_id: string;
    exchange_index: ExchangeIndex;
    trade_id: string;
    order_id: string;
    ticker: string;
    market_ticker: string;
    outcome_side: OutcomeSide;
    book_side: BookSide;
    count_fp: FixedPointCount;
    yes_price_dollars: FixedPointDollars;
    no_price_dollars: FixedPointDollars;
    is_taker: boolean;
    fee_cost: FixedPointDollars;
    created_time?: string;
    subaccount_number?: number | null;
    ts?: number;
}

export interface GetFillsParams extends CursorPaginationParams {
    ticker?: string;
    order_id?: string;
    min_ts?: number;
    max_ts?: number;
    subaccount?: number;
    exchange_index?: ExchangeIndex;
}

export interface GetFillsResponse {
    fills: Fill[];
    cursor: string;
}

// --- Orders ---------------------------------------------------------------

export interface Order {
    order_id: string;
    user_id: string;
    client_order_id: string;
    ticker: string;
    outcome_side: OutcomeSide;
    book_side: BookSide;
    type: OrderType;
    status: OrderStatus;
    yes_price_dollars: FixedPointDollars;
    no_price_dollars: FixedPointDollars;
    fill_count_fp: FixedPointCount;
    remaining_count_fp: FixedPointCount;
    initial_count_fp: FixedPointCount;
    taker_fees_dollars: FixedPointDollars;
    maker_fees_dollars: FixedPointDollars;
    taker_fill_cost_dollars: FixedPointDollars;
    maker_fill_cost_dollars: FixedPointDollars;
    expiration_time?: string | null;
    created_time?: string | null;
    last_update_time?: string | null;
    self_trade_prevention_type?: SelfTradePreventionType | null;
    order_group_id?: string | null;
    cancel_order_on_pause?: boolean;
    subaccount_number?: number | null;
    exchange_index?: ExchangeIndex;
}

export interface GetOrdersParams extends CursorPaginationParams {
    ticker?: string;
    /** Comma-separated list, maximum 10 event tickers. */
    event_ticker?: string;
    min_ts?: number;
    max_ts?: number;
    status?: OrderStatus;
    subaccount?: number;
    exchange_index?: ExchangeIndex;
}

export interface GetOrdersResponse {
    orders: Order[];
    cursor: string;
}

export interface GetOrderResponse {
    order: Order;
}

export interface CreateOrderRequest {
    ticker: string;
    side: BookSide;
    count: FixedPointCount;
    price: FixedPointDollars;
    time_in_force: TimeInForce;
    self_trade_prevention_type: SelfTradePreventionType;
    client_order_id?: string;
    /** Unix seconds; only valid together with `good_till_canceled`. */
    expiration_time?: number;
    post_only?: boolean;
    cancel_order_on_pause?: boolean;
    reduce_only?: boolean;
    subaccount?: number;
    order_group_id?: string;
    exchange_index?: ExchangeIndex;
}

export interface CreateOrderResponse {
    order_id: string;
    client_order_id?: string;
    fill_count: FixedPointCount;
    remaining_count: FixedPointCount;
    average_fill_price?: FixedPointDollars;
    average_fee_paid?: FixedPointDollars;
    /** Matching engine timestamp, Unix epoch milliseconds. */
    ts_ms: number;
}

export interface CancelOrderParams {
    subaccount?: number;
    exchange_index?: ExchangeIndex;
    /** Used for auto-routing when `exchange_index` is omitted or -1. */
    market_ticker?: string;
}

export interface CancelOrderResponse {
    order_id: string;
    client_order_id?: string;
    /** Contracts that were cancelled, i.e. the remaining count at cancel time. */
    reduced_by: FixedPointCount;
    ts_ms: number;
}
