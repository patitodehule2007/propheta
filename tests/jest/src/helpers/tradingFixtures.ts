import { randomUUID } from "crypto";

/**
 * Shared vocabulary for the trading-gate integration tests: the fixture
 * tickers kalshi-mock serves, the markers anthropic-mock reads, and the one
 * registry of which signal identity each test posts under.
 */

/** Monitored accounts seeded by database/init/sql/seed/ingestion_accounts.sql. */
export const MonitoredUser = {
    REAL_DONALD_TRUMP: "25073877",
    WHITE_HOUSE: "1349149096909668362",
    JD_VANCE: "210437201"
} as const;

export type MonitoredUser = (typeof MonitoredUser)[keyof typeof MonitoredUser];

export const Topic = {
    APPOINTMENTS_PERSONNEL: "APPOINTMENTS_PERSONNEL",
    MONETARY_POLICY_FED: "MONETARY_POLICY_FED",
    INTERNATIONAL_CONFLICT: "INTERNATIONAL_CONFLICT",
    SHUTDOWN_BUDGET: "SHUTDOWN_BUDGET",
    CRYPTO_REGULATION: "CRYPTO_REGULATION",
    NONE: "NONE"
} as const;

export type Topic = (typeof Topic)[keyof typeof Topic];

export const Direction = {
    INCREASES: "INCREASES",
    DECREASES: "DECREASES",
    UNCLEAR: "UNCLEAR"
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

/**
 * kalshi-mock fixture tickers (mocks/kalshi-mock/src/state.ts). Every
 * KXTEST market is a candidate for MONETARY_POLICY_FED,
 * APPOINTMENTS_PERSONNEL, INTERNATIONAL_CONFLICT and CRYPTO_REGULATION
 * (tests/jest/fixtures/trading_topic_series.sql).
 */
export const TestTicker = {
    /** Baseline book no test mutates. */
    BASE: "KXTEST-BASE",
    STOP_LOSS: "KXTEST-SL",
    TAKE_PROFIT: "KXTEST-TP",
    TIME_LIMIT: "KXTEST-TL",
    MARKET_CLOSE: "KXTEST-MC",
    WIDE_SPREAD: "KXTEST-WIDE",
    THIN_BOOK: "KXTEST-THIN",
    NO_ASK: "KXTEST-NOASK",
    CLOSING_SOON: "KXTEST-CLOSING",
    SLIPPAGE: "KXTEST-SLIP",
    /** Not served by kalshi-mock -- never a candidate. */
    HALLUCINATED: "KXTEST-DOESNOTEXIST"
} as const;

export type TestTicker = (typeof TestTicker)[keyof typeof TestTicker];

/** Who posts, and how anthropic-mock classifies it. */
export interface SignalIdentity {
    userId: MonitoredUser;
    topic: Topic;
    direction: Direction;
}

function signal(userId: MonitoredUser, topic: Topic, direction: Direction): SignalIdentity {
    return { userId, topic, direction };
}

/**
 * One distinct identity per test. The pre-gate vetoes a post as `no_novelty`
 * when the same author already posted the same topic and direction within
 * `TRADE_NOVELTY_WINDOW_HOURS`, and that window spans the whole run -- so no
 * two tests that must pass gate 1 may share an identity. realDonaldTrump +
 * TARIFFS_TRADE + INCREASES and JDVance + TARIFFS_TRADE + INCREASES are taken
 * by the ingestion, agent and tradeDecision suites.
 */
export const Signals = {
    // Gate 1
    topicNotTradable: signal(MonitoredUser.REAL_DONALD_TRUMP, Topic.NONE, Direction.INCREASES),
    directionUnclear: signal(MonitoredUser.REAL_DONALD_TRUMP, Topic.INTERNATIONAL_CONFLICT, Direction.UNCLEAR),
    novelty: signal(MonitoredUser.JD_VANCE, Topic.SHUTDOWN_BUDGET, Direction.INCREASES),
    // Gate 2
    noLiquidMarket: signal(MonitoredUser.WHITE_HOUSE, Topic.SHUTDOWN_BUDGET, Direction.INCREASES),
    // Gate 3
    modelNoTrade: signal(MonitoredUser.JD_VANCE, Topic.CRYPTO_REGULATION, Direction.INCREASES),
    agentError: signal(MonitoredUser.JD_VANCE, Topic.CRYPTO_REGULATION, Direction.DECREASES),
    // Gate 4
    hallucinatedTicker: signal(MonitoredUser.WHITE_HOUSE, Topic.MONETARY_POLICY_FED, Direction.INCREASES),
    marketNotOpen: signal(MonitoredUser.WHITE_HOUSE, Topic.MONETARY_POLICY_FED, Direction.DECREASES),
    spreadOverLimit: signal(MonitoredUser.WHITE_HOUSE, Topic.INTERNATIONAL_CONFLICT, Direction.INCREASES),
    edgeBelowCost: signal(MonitoredUser.WHITE_HOUSE, Topic.INTERNATIONAL_CONFLICT, Direction.DECREASES),
    exposureCapTrade: signal(MonitoredUser.WHITE_HOUSE, Topic.CRYPTO_REGULATION, Direction.INCREASES),
    slippageOverLimit: signal(MonitoredUser.WHITE_HOUSE, Topic.CRYPTO_REGULATION, Direction.DECREASES),
    // Gate 5
    closingTooSoon: signal(MonitoredUser.REAL_DONALD_TRUMP, Topic.MONETARY_POLICY_FED, Direction.INCREASES),
    // Gate 6
    stopLoss: signal(MonitoredUser.JD_VANCE, Topic.MONETARY_POLICY_FED, Direction.INCREASES),
    takeProfit: signal(MonitoredUser.JD_VANCE, Topic.MONETARY_POLICY_FED, Direction.DECREASES),
    timeLimit: signal(MonitoredUser.JD_VANCE, Topic.INTERNATIONAL_CONFLICT, Direction.INCREASES),
    marketClose: signal(MonitoredUser.JD_VANCE, Topic.INTERNATIONAL_CONFLICT, Direction.DECREASES)
} as const satisfies Record<string, SignalIdentity>;

/** Selection-agent markers anthropic-mock reads from the post text. */
export interface SelectionMarkers {
    ticker?: string;
    fairProbability?: number;
    horizonMinutes?: number;
    selection?: "no_trade" | "invalid";
}

function marker(name: string, value: string | number): string {
    return `[[${name}:${value}]]`;
}

/**
 * Builds a post text that anthropic-mock classifies as `identity` and, when
 * markers are given, answers the selection stage accordingly. A random
 * suffix keeps every post's text unique.
 *
 * @param identity - topic and direction the classifier will return
 * @param markers - selection-stage overrides
 * @returns the post text to send through `simulatePost`
 */
export function buildSignalText(identity: SignalIdentity, markers: SelectionMarkers = {}): string {
    const parts = [
        "Integration test signal.",
        marker("topic", identity.topic),
        marker("direction", identity.direction)
    ];
    if (markers.ticker !== undefined) parts.push(marker("ticker", markers.ticker));
    if (markers.fairProbability !== undefined) parts.push(marker("fair", markers.fairProbability));
    if (markers.horizonMinutes !== undefined) parts.push(marker("horizon", markers.horizonMinutes));
    if (markers.selection !== undefined) parts.push(marker("selection", markers.selection));
    parts.push(`(${randomUUID()})`);
    return parts.join(" ");
}
