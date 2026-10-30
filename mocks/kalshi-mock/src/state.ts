/**
 * Deterministic fixtures and in-memory state for the Kalshi mock.
 *
 * Only the surface `backend/src/modules/kalshi` and `backend/src/modules/trading`
 * actually call is implemented -- this is a test double, not a full Kalshi
 * clone. Which topics reach each series is decided by the test stack's
 * whitelist, `tests/jest/fixtures/trading_topic_series.sql`, not by tags:
 *
 * - `KXTARIFF` -- TARIFFS_TRADE only. The happy-path market.
 * - `KXTEST` -- MONETARY_POLICY_FED, APPOINTMENTS_PERSONNEL,
 *   INTERNATIONAL_CONFLICT and CRYPTO_REGULATION. One market per gate/exit
 *   scenario, so a test that mutates a book or a close time never touches
 *   another test's position. Several topics, so integration tests have
 *   enough distinct (author, topic, direction) combinations to stay clear of
 *   the pre-gate's novelty heuristic.
 * - `KXLOWVOL` -- the only series SHUTDOWN_BUDGET reaches. Series volume
 *   below the test stack's TRADE_MIN_SERIES_VOLUME, so gate 2 finds a market
 *   but no liquid one.
 *
 * IMMIGRATION deliberately resolves to no series at all (gate 2's
 * `no_open_market` case).
 */

export interface MockSeries {
    ticker: string;
    frequency: string;
    title: string;
    category: string;
    tags: string[];
    settlement_sources: unknown[];
    fee_type: "quadratic" | "quadratic_with_maker_fees" | "flat";
    fee_multiplier: number;
    additional_prohibitions: string[];
    volume_fp: string;
    last_updated_ts: string;
}

export interface MockMarket {
    ticker: string;
    event_ticker: string;
    series_ticker: string;
    market_type: "binary";
    yes_sub_title: string;
    no_sub_title: string;
    // Lifecycle values, as the real API returns them -- not the `status`
    // query filter's vocabulary (see MARKET_STATUS_FILTERS in index.ts).
    status: "active" | "closed" | "finalized";
    close_time: string;
    updated_time: string;
    rules_primary: string;
    rules_secondary: string;
    volume_24h_fp: string;
    open_interest_fp: string;
}

/** [price_dollars, count] tuples, ascending -- best bid is the LAST element. */
export type MockPriceLevel = [string, string];

export interface MockOrderbook {
    yes_dollars: MockPriceLevel[];
    no_dollars: MockPriceLevel[];
}

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
// Inside the backend's EXIT_CLOSE_BUFFER_MINUTES (30) from the moment the mock
// starts, so gate 5's close-buffer clamp always drives the horizon below the
// floor -- however long the suite has been running.
const CLOSING_SOON_MINUTES = 20;

const nowIso = new Date().toISOString();
const closeTime = new Date(Date.now() + 7 * MS_PER_DAY).toISOString();
const closingSoonTime = new Date(Date.now() + CLOSING_SOON_MINUTES * MS_PER_MINUTE).toISOString();

function buildSeries(overrides: Pick<MockSeries, "ticker" | "title" | "tags"> & { volume: number }): MockSeries {
    const { volume, ...rest } = overrides;
    return {
        frequency: "one-off",
        category: "Economics",
        settlement_sources: [],
        fee_type: "quadratic",
        // Kalshi's real value for the standard schedule: a scale on 0.07.
        fee_multiplier: 1,
        additional_prohibitions: [],
        volume_fp: `${volume}.00`,
        last_updated_ts: nowIso,
        ...rest
    };
}

function buildMarket(
    overrides: Pick<MockMarket, "ticker" | "event_ticker" | "series_ticker" | "yes_sub_title" | "volume_24h_fp"> &
        Partial<MockMarket>
): MockMarket {
    return {
        market_type: "binary",
        no_sub_title: `Not: ${overrides.yes_sub_title}`,
        status: "active",
        close_time: closeTime,
        updated_time: nowIso,
        rules_primary: `This market resolves YES if ${overrides.yes_sub_title.toLowerCase()}`,
        rules_secondary: "Settlement source: official press releases.",
        open_interest_fp: "1200.00",
        ...overrides
    };
}

/** Builds one KXTEST scenario market; `volume` only decides candidate ranking. */
function buildTestMarket(suffix: string, description: string, volume: number, extra: Partial<MockMarket> = {}) {
    return buildMarket({
        ticker: `KXTEST-${suffix}`,
        event_ticker: "KXTEST-26",
        series_ticker: "KXTEST",
        yes_sub_title: `Integration test market: ${description}`,
        volume_24h_fp: `${volume}.00`,
        ...extra
    });
}

/**
 * The baseline book every scenario starts from: YES bid 40c / ask 42c
 * (ask derived from the 58c NO bid), 2c spread, 20 contracts at the top.
 */
function standardOrderbook(): MockOrderbook {
    return {
        yes_dollars: [
            ["0.3000", "10.00"],
            ["0.4000", "20.00"]
        ],
        no_dollars: [
            ["0.5000", "15.00"],
            ["0.5800", "25.00"]
        ]
    };
}

export const SERIES: MockSeries[] = [
    buildSeries({ ticker: "KXTARIFF", title: "Tariff announcements", tags: ["Inflation"], volume: 5000 }),
    buildSeries({
        ticker: "KXTEST",
        title: "Propheta integration test markets",
        tags: ["Fed", "Iran", "Crypto"],
        volume: 5000
    }),
    buildSeries({ ticker: "KXLOWVOL", title: "Thinly traded congressional markets", tags: ["Congress"], volume: 10 })
];

const INITIAL_MARKETS: MockMarket[] = [
    buildMarket({
        ticker: "KXTARIFF-25-A",
        event_ticker: "KXTARIFF-25",
        series_ticker: "KXTARIFF",
        yes_sub_title: "Will new tariffs be announced this quarter?",
        no_sub_title: "No new tariffs announced this quarter.",
        rules_primary:
            "This market resolves YES if the U.S. federal government announces new tariffs on any trading " +
            "partner before the close time, as reported by the settlement source.",
        rules_secondary: "Settlement source: official White House and USTR press releases.",
        volume_24h_fp: "800.00"
    }),
    // BASE has the highest volume, so it is what the selection mock proposes
    // when a post on a KXTEST topic carries no `[[ticker:...]]` marker.
    buildTestMarket("BASE", "baseline book", 900),
    buildTestMarket("SL", "stop-loss exit", 800),
    buildTestMarket("TP", "take-profit exit", 800),
    buildTestMarket("TL", "time-limit exit", 800),
    buildTestMarket("MC", "market-close exit", 800),
    buildTestMarket("WIDE", "spread over the limit", 700),
    buildTestMarket("THIN", "top of book under one contract", 700),
    buildTestMarket("NOASK", "no NO bids, so no YES ask", 700),
    buildTestMarket("CLOSING", "closes inside the exit buffer", 700, { close_time: closingSoonTime }),
    buildTestMarket("SLIP", "price moved since the signal", 700),
    buildMarket({
        ticker: "KXLOWVOL-26-A",
        event_ticker: "KXLOWVOL-26",
        series_ticker: "KXLOWVOL",
        yes_sub_title: "Will a cabinet nominee be confirmed this month?",
        volume_24h_fp: "5.00"
    })
];

const INITIAL_ORDERBOOKS: Record<string, MockOrderbook> = {
    "KXTARIFF-25-A": standardOrderbook(),
    "KXTEST-BASE": standardOrderbook(),
    "KXTEST-SL": standardOrderbook(),
    "KXTEST-TP": standardOrderbook(),
    "KXTEST-TL": standardOrderbook(),
    "KXTEST-MC": standardOrderbook(),
    // YES bid 30c vs. YES ask 42c: a 12c spread.
    "KXTEST-WIDE": { yes_dollars: [["0.3000", "20.00"]], no_dollars: standardOrderbook().no_dollars },
    // Half a contract on both sides, so sizing floors to zero whichever side
    // the depth cap reads.
    "KXTEST-THIN": { yes_dollars: [["0.4000", "0.50"]], no_dollars: [["0.5800", "0.50"]] },
    "KXTEST-NOASK": { yes_dollars: standardOrderbook().yes_dollars, no_dollars: [] },
    "KXTEST-CLOSING": standardOrderbook(),
    "KXTEST-SLIP": standardOrderbook(),
    "KXLOWVOL-26-A": standardOrderbook()
};

export const MARKETS: MockMarket[] = structuredClone(INITIAL_MARKETS);

/** Order books keyed by ticker. Ascending price levels, per the real API. */
export const ORDERBOOKS: Record<string, MockOrderbook> = structuredClone(INITIAL_ORDERBOOKS);

export interface MockOrder {
    order_id: string;
    client_order_id: string;
    ticker: string;
    side: "bid" | "ask";
    count: string;
    price: string;
    ts_ms: number;
}

/** Orders keyed by client_order_id, for idempotency (a repeat returns 409). */
export const ORDERS_BY_CLIENT_ID = new Map<string, MockOrder>();

/**
 * Replaces a ticker's order book. Returns false for an unknown ticker so the
 * caller can 404 instead of silently creating a book nothing lists.
 */
export function replaceOrderbook(ticker: string, orderbook: MockOrderbook): boolean {
    if (!ORDERBOOKS[ticker]) return false;
    ORDERBOOKS[ticker] = orderbook;
    return true;
}

/** Moves a market's close time. Returns null for an unknown ticker. */
export function updateMarketCloseTime(ticker: string, closeTimeIso: string): MockMarket | null {
    const market = MARKETS.find((entry) => entry.ticker === ticker);
    if (!market) return null;
    market.close_time = closeTimeIso;
    market.updated_time = new Date().toISOString();
    return market;
}

/**
 * Restores every market and order book to its startup fixture. Mutates in
 * place: the route handlers hold references to these exact objects.
 */
export function resetState(): void {
    MARKETS.splice(0, MARKETS.length, ...structuredClone(INITIAL_MARKETS));
    for (const ticker of Object.keys(ORDERBOOKS)) delete ORDERBOOKS[ticker];
    Object.assign(ORDERBOOKS, structuredClone(INITIAL_ORDERBOOKS));
}
