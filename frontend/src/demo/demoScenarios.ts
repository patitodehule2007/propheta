/**
 * Simulated dashboard states for presentations. Values mirror the real backend
 * vocabulary (`backend/src/shared/core/decisionLog.constants.ts`) and the rows the
 * pipeline actually writes: gates that pass silently write no `decision_log` row.
 *
 * The story: a WhiteHouse post announces the Fed Chair nominee for tomorrow. In
 * AFTER_BUY the matching Kalshi market still trades at 61¢ and the agent buys; in
 * AFTER_NO_TRADE the same post arrives when the market already trades at 92¢, so
 * the selection agent declines it as priced in.
 */

import { ConnectionState } from "../components/ui";
import { RECENT_DECISIONS_LIMIT } from "../components/dashboard";
import { PipelineStepStatus } from "../types/dashboard";
import type {
    DashboardData,
    LatestPost,
    OpenPosition,
    PipelineStep,
    SystemStatus,
    TradingMetrics
} from "../types/dashboard";
import type { DecisionLogEntry } from "../types/decisions";

export const DemoScenarioId = {
    BEFORE: "before",
    AFTER_BUY: "after-buy",
    AFTER_NO_TRADE: "after-no-trade"
} as const;
export type DemoScenarioId = (typeof DemoScenarioId)[keyof typeof DemoScenarioId];

export interface DemoScenario {
    id: DemoScenarioId;
    label: string;
    caption: string;
    status: SystemStatus;
    data: DashboardData;
}

const Stage = {
    TWEET_RECEIVED: "TWEET_RECEIVED",
    AGENT_ANALYSIS: "AGENT_ANALYSIS",
    TRADE_CANDIDATES: "TRADE_CANDIDATES",
    TRADE_DECISION: "TRADE_DECISION",
    RISK_VALIDATION: "RISK_VALIDATION",
    ORDER: "ORDER",
    EXIT: "EXIT"
} as const;
type Stage = (typeof Stage)[keyof typeof Stage];

const Outcome = {
    INGESTED: "INGESTED",
    CLASSIFIED: "CLASSIFIED",
    PROPOSED: "PROPOSED",
    NO_TRADE: "NO_TRADE",
    REJECTED: "REJECTED",
    ORDER_PLACED: "ORDER_PLACED",
    EXIT_TAKE_PROFIT: "EXIT_TAKE_PROFIT"
} as const;

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/** When the WhiteHouse post lands; every other timestamp is relative to it. */
const NEW_POST_AT_MS = Date.parse("2026-01-29T22:14:08.000Z");

function at(offsetSeconds: number): string {
    return new Date(NEW_POST_AT_MS + offsetSeconds * MS_PER_SECOND).toISOString();
}

function minutes(value: number): number {
    return value * SECONDS_PER_MINUTE;
}

function hours(value: number): number {
    return value * SECONDS_PER_HOUR;
}

interface DemoPost {
    ingestedPostId: string;
    platformPostId: string;
    authorHandle: string;
    text: string;
    postedAtOffset: number;
}

const FED_POST: DemoPost = {
    ingestedPostId: "demo-post-fed",
    platformPostId: "2016961538466140262",
    authorHandle: "WhiteHouse",
    text: "The President will announce his nominee for Chair of the Federal Reserve tomorrow at 10am.",
    postedAtOffset: 0
};

const LILLY_POST: DemoPost = {
    ingestedPostId: "demo-post-lilly",
    platformPostId: "2016949712054571337",
    authorHandle: "realDonaldTrump",
    text:
        "Lilly breaks ground in Pennsylvania's Lehigh Valley on a $3.5 billion site to make next-generation " +
        "obesity medicines, the latest of 10 new U.S. sites since 2020: investor.lilly.com/news-releas",
    postedAtOffset: -minutes(47)
};

const VANCE_POST: DemoPost = {
    ingestedPostId: "demo-post-vance",
    platformPostId: "2016929004183622015",
    authorHandle: "JDVance",
    text: "Just met with Senate leadership. The government funding bill will pass before the deadline.",
    postedAtOffset: -minutes(130)
};

const TARIFF_POST: DemoPost = {
    ingestedPostId: "demo-post-tariff",
    platformPostId: "2016869120477437952",
    authorHandle: "realDonaldTrump",
    text: "",
    postedAtOffset: -minutes(372)
};

const FED_TICKER = "KXFEDCHAIRANN-26JAN31";
const SHUTDOWN_TICKER = "KXGOVSHUT-26JAN31";
const TARIFF_TICKER = "KXTARIFFCN-26FEB01";

const FED_BUY = {
    contracts: 40,
    entryPriceCents: 61,
    markPriceCents: 66,
    stopPriceCents: 49,
    targetPriceCents: 82,
    deadlineAt: at(hours(4))
} as const;

function entry(
    post: DemoPost,
    stage: Stage,
    decision: string,
    offsetSeconds: number,
    reason: string | null = null,
    metadata: Record<string, unknown> | null = null
): DecisionLogEntry {
    return {
        id: `${post.ingestedPostId}-${stage}`,
        ingestedPostId: post.ingestedPostId,
        platformPostId: post.platformPostId,
        stage,
        decision,
        reason,
        metadata,
        createdAt: at(post.postedAtOffset + offsetSeconds)
    };
}

function classification(topic: string, direction: string, confidence: number): Record<string, unknown> {
    return { topic, direction, confidence };
}

/** Rows already in the tape before the WhiteHouse post arrives, newest first. */
const HISTORY: readonly DecisionLogEntry[] = [
    entry(LILLY_POST, Stage.TRADE_CANDIDATES, Outcome.NO_TRADE, 12, "topic_not_tradable"),
    entry(LILLY_POST, Stage.AGENT_ANALYSIS, Outcome.CLASSIFIED, 11, null, classification("NONE", "UNCLEAR", 0.41)),
    entry(LILLY_POST, Stage.TWEET_RECEIVED, Outcome.INGESTED, 0),
    entry(VANCE_POST, Stage.RISK_VALIDATION, Outcome.REJECTED, 19, "spread_over_limit", { ticker: SHUTDOWN_TICKER }),
    entry(VANCE_POST, Stage.TRADE_DECISION, Outcome.PROPOSED, 17, null, { ticker: SHUTDOWN_TICKER, outcomeSide: "NO" }),
    entry(
        VANCE_POST,
        Stage.AGENT_ANALYSIS,
        Outcome.CLASSIFIED,
        9,
        null,
        classification("SHUTDOWN_BUDGET", "DECREASES", 0.74)
    ),
    entry(VANCE_POST, Stage.TWEET_RECEIVED, Outcome.INGESTED, 0),
    entry(TARIFF_POST, Stage.EXIT, Outcome.EXIT_TAKE_PROFIT, minutes(112), "take_profit", { ticker: TARIFF_TICKER }),
    entry(TARIFF_POST, Stage.ORDER, Outcome.ORDER_PLACED, 9, null, {
        ticker: TARIFF_TICKER,
        outcomeSide: "YES",
        contracts: 25,
        entryPriceCents: 38,
        stopPriceCents: 29,
        targetPriceCents: 52
    })
];

const FED_CLASSIFICATION = classification("APPOINTMENTS_PERSONNEL", "INCREASES", 0.86);

const FED_BUY_ROWS: readonly DecisionLogEntry[] = [
    entry(FED_POST, Stage.ORDER, Outcome.ORDER_PLACED, 9, null, {
        ticker: FED_TICKER,
        outcomeSide: "YES",
        contracts: FED_BUY.contracts,
        entryPriceCents: FED_BUY.entryPriceCents,
        stopPriceCents: FED_BUY.stopPriceCents,
        targetPriceCents: FED_BUY.targetPriceCents,
        positionId: "demo-position-fed",
        deadlineAt: FED_BUY.deadlineAt
    }),
    entry(FED_POST, Stage.TRADE_DECISION, Outcome.PROPOSED, 8, null, {
        ticker: FED_TICKER,
        outcomeSide: "YES",
        fairProbability: 0.84
    }),
    entry(FED_POST, Stage.AGENT_ANALYSIS, Outcome.CLASSIFIED, 5, null, FED_CLASSIFICATION),
    entry(FED_POST, Stage.TWEET_RECEIVED, Outcome.INGESTED, 0)
];

const FED_NO_TRADE_ROWS: readonly DecisionLogEntry[] = [
    entry(FED_POST, Stage.TRADE_DECISION, Outcome.NO_TRADE, 8, "already_priced_in", {
        ticker: FED_TICKER,
        outcomeSide: "YES",
        fairProbability: 0.84
    }),
    entry(FED_POST, Stage.AGENT_ANALYSIS, Outcome.CLASSIFIED, 5, null, FED_CLASSIFICATION),
    entry(FED_POST, Stage.TWEET_RECEIVED, Outcome.INGESTED, 0)
];

function tape(newRows: readonly DecisionLogEntry[]): DecisionLogEntry[] {
    return [...newRows, ...HISTORY].slice(0, RECENT_DECISIONS_LIMIT);
}

function step(stage: Stage, status: PipelineStepStatus, decision: string | null, detail: string | null): PipelineStep {
    return { stage, status, decision, detail };
}

function notReached(stage: Stage): PipelineStep {
    return step(stage, PipelineStepStatus.NOT_REACHED, null, null);
}

function latestPost(post: DemoPost, steps: PipelineStep[]): LatestPost {
    return {
        platformPostId: post.platformPostId,
        authorHandle: post.authorHandle,
        text: post.text,
        postedAt: at(post.postedAtOffset),
        steps
    };
}

const { PASSED, STOPPED } = PipelineStepStatus;

const FED_COMMON_STEPS: readonly PipelineStep[] = [
    step(Stage.TWEET_RECEIVED, PASSED, Outcome.INGESTED, "monitored account · signature valid"),
    step(Stage.AGENT_ANALYSIS, PASSED, Outcome.CLASSIFIED, "appointments personnel · increases · 86% conf."),
    step(Stage.TRADE_CANDIDATES, PASSED, null, "3 open markets matched")
];

const LILLY_LATEST = latestPost(LILLY_POST, [
    step(Stage.TWEET_RECEIVED, PASSED, Outcome.INGESTED, "monitored account · signature valid"),
    step(Stage.AGENT_ANALYSIS, PASSED, Outcome.CLASSIFIED, "no tradable topic · 41% conf."),
    step(Stage.TRADE_CANDIDATES, STOPPED, Outcome.NO_TRADE, "topic not tradable"),
    notReached(Stage.TRADE_DECISION),
    notReached(Stage.RISK_VALIDATION),
    notReached(Stage.ORDER)
]);

const FED_BUY_LATEST = latestPost(FED_POST, [
    ...FED_COMMON_STEPS,
    step(Stage.TRADE_DECISION, PASSED, Outcome.PROPOSED, "BUY YES · fair 84¢ vs ask 61¢"),
    step(Stage.RISK_VALIDATION, PASSED, null, "edge 21¢ after fees · within exposure caps"),
    step(Stage.ORDER, PASSED, Outcome.ORDER_PLACED, `${FED_BUY.contracts} × YES @ ${FED_BUY.entryPriceCents}¢`)
]);

const FED_NO_TRADE_LATEST = latestPost(FED_POST, [
    ...FED_COMMON_STEPS,
    step(Stage.TRADE_DECISION, STOPPED, Outcome.NO_TRADE, "already priced in · ask 92¢ vs fair 84¢"),
    notReached(Stage.RISK_VALIDATION),
    notReached(Stage.ORDER)
]);

const FED_POSITION: OpenPosition = {
    id: "demo-position-fed",
    ticker: FED_TICKER,
    marketTitle: "Fed Chair nominee announced before Jan 31?",
    outcomeSide: "YES",
    contracts: FED_BUY.contracts,
    entryPriceCents: FED_BUY.entryPriceCents,
    markPriceCents: FED_BUY.markPriceCents,
    stopPriceCents: FED_BUY.stopPriceCents,
    targetPriceCents: FED_BUY.targetPriceCents,
    deadlineAt: FED_BUY.deadlineAt
};

const FED_UNREALIZED_CENTS = (FED_BUY.markPriceCents - FED_BUY.entryPriceCents) * FED_BUY.contracts;

const BASE_METRICS: TradingMetrics = {
    pnlCents: 1240,
    unrealizedPnlCents: 0,
    openPositionCount: 0,
    atRiskCents: 0,
    latencyP95Ms: 9100,
    decidedPostCount: 14,
    hitRatePercent: 58,
    closedTradeCount: 12
};

const LIVE_STATUS: SystemStatus = {
    xWebhook: ConnectionState.LIVE,
    kalshiWebSocket: ConnectionState.LIVE
};

export const DEMO_SCENARIOS: Record<DemoScenarioId, DemoScenario> = {
    [DemoScenarioId.BEFORE]: {
        id: DemoScenarioId.BEFORE,
        label: "Before the post",
        caption: "Listening. The agent is flat; the last post was filtered out as not tradable.",
        status: LIVE_STATUS,
        data: {
            metrics: BASE_METRICS,
            latestPost: LILLY_LATEST,
            openPositions: [],
            decisions: tape([]),
            highlightedPostId: null
        }
    },
    [DemoScenarioId.AFTER_BUY]: {
        id: DemoScenarioId.AFTER_BUY,
        label: "After · buys",
        caption: "The market still trades at 61¢ against an 84% fair value: every gate passes and an order is placed.",
        status: LIVE_STATUS,
        data: {
            metrics: {
                ...BASE_METRICS,
                pnlCents: BASE_METRICS.pnlCents + FED_UNREALIZED_CENTS,
                unrealizedPnlCents: FED_UNREALIZED_CENTS,
                openPositionCount: 1,
                atRiskCents: FED_BUY.contracts * FED_BUY.entryPriceCents,
                latencyP95Ms: 8800,
                decidedPostCount: BASE_METRICS.decidedPostCount + 1
            },
            latestPost: FED_BUY_LATEST,
            openPositions: [FED_POSITION],
            decisions: tape(FED_BUY_ROWS),
            highlightedPostId: FED_POST.platformPostId
        }
    },
    [DemoScenarioId.AFTER_NO_TRADE]: {
        id: DemoScenarioId.AFTER_NO_TRADE,
        label: "After · no trade",
        caption: "Same post, but the market already moved to 92¢: no edge left, so the agent stands aside.",
        status: LIVE_STATUS,
        data: {
            metrics: {
                ...BASE_METRICS,
                latencyP95Ms: 9000,
                decidedPostCount: BASE_METRICS.decidedPostCount + 1
            },
            latestPost: FED_NO_TRADE_LATEST,
            openPositions: [],
            decisions: tape(FED_NO_TRADE_ROWS),
            highlightedPostId: FED_POST.platformPostId
        }
    }
};

export const DEMO_SCENARIO_ORDER: readonly DemoScenarioId[] = [
    DemoScenarioId.BEFORE,
    DemoScenarioId.AFTER_BUY,
    DemoScenarioId.AFTER_NO_TRADE
];

/**
 * Narrows a route parameter to a known scenario id.
 *
 * @param value - Raw `:scenarioId` route parameter.
 * @returns Whether the value names a demo scenario.
 */
export function isDemoScenarioId(value: string | undefined): value is DemoScenarioId {
    return DEMO_SCENARIO_ORDER.some((id) => id === value);
}
