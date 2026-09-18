/**
 * Deterministic fixtures and in-memory state for the Kalshi mock.
 *
 * Only the surface `backend/src/modules/kalshi` and `backend/src/modules/trading`
 * actually call is implemented -- this is a test double, not a full Kalshi
 * clone. Two markets under one series ("Trade"/"Tariffs" tags, matching
 * `database/init/sql/seed/trading_topic_map.sql`'s TARIFFS_TRADE mapping) so
 * the candidate-assembly path has something real to find.
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
    volume: number;
    volume_24h: number;
    last_updated_ts: string;
}

export interface MockMarket {
    ticker: string;
    event_ticker: string;
    series_ticker: string;
    market_type: "binary";
    yes_sub_title: string;
    no_sub_title: string;
    status: "open" | "closed" | "settled";
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

const nowIso = new Date().toISOString();
const closeTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

export const SERIES: MockSeries[] = [
    {
        ticker: "KXTARIFF",
        frequency: "one-off",
        title: "Tariff announcements",
        category: "Economics",
        tags: ["Trade", "Tariffs"],
        settlement_sources: [],
        fee_type: "quadratic",
        fee_multiplier: 0.07,
        additional_prohibitions: [],
        volume: 5000,
        volume_24h: 800,
        last_updated_ts: nowIso
    }
];

export const MARKETS: MockMarket[] = [
    {
        ticker: "KXTARIFF-25-A",
        event_ticker: "KXTARIFF-25",
        series_ticker: "KXTARIFF",
        market_type: "binary",
        yes_sub_title: "Will new tariffs be announced this quarter?",
        no_sub_title: "No new tariffs announced this quarter.",
        status: "open",
        close_time: closeTime,
        updated_time: nowIso,
        rules_primary:
            "This market resolves YES if the U.S. federal government announces new tariffs on any trading " +
            "partner before the close time, as reported by the settlement source.",
        rules_secondary: "Settlement source: official White House and USTR press releases.",
        volume_24h_fp: "800.00",
        open_interest_fp: "1200.00"
    }
];

/** Order books keyed by ticker. Ascending price levels, per the real API. */
export const ORDERBOOKS: Record<string, MockOrderbook> = {
    "KXTARIFF-25-A": {
        yes_dollars: [
            ["0.3000", "10.00"],
            ["0.4000", "20.00"]
        ],
        no_dollars: [
            ["0.5000", "15.00"],
            ["0.5800", "25.00"]
        ]
    }
};

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
