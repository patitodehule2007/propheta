import type { ConnectionState } from "../components/ui";
import type { DecisionLogEntry } from "./decisions";

/** Where a post stands at one pipeline stage. */
export const PipelineStepStatus = {
    PASSED: "passed",
    STOPPED: "stopped",
    NOT_REACHED: "not-reached"
} as const;
export type PipelineStepStatus = (typeof PipelineStepStatus)[keyof typeof PipelineStepStatus];

export interface PipelineStep {
    stage: string;
    status: PipelineStepStatus;
    /** `decision_log.decision` written at this stage; null when the gate passed silently. */
    decision: string | null;
    detail: string | null;
}

export interface LatestPost {
    platformPostId: string;
    authorHandle: string;
    text: string;
    postedAt: string;
    steps: PipelineStep[];
}

export interface OpenPosition {
    id: string;
    ticker: string;
    marketTitle: string;
    outcomeSide: string;
    contracts: number;
    entryPriceCents: number;
    markPriceCents: number;
    stopPriceCents: number | null;
    targetPriceCents: number | null;
    deadlineAt: string;
}

export interface TradingMetrics {
    pnlCents: number;
    unrealizedPnlCents: number;
    openPositionCount: number;
    atRiskCents: number;
    latencyP95Ms: number;
    decidedPostCount: number;
    hitRatePercent: number;
    closedTradeCount: number;
}

export interface SystemStatus {
    xWebhook: ConnectionState;
    kalshiWebSocket: ConnectionState;
}

/**
 * Everything the dashboard renders. A `null` section has no backend source yet
 * and renders its "Not available yet" state.
 */
export interface DashboardData {
    metrics: TradingMetrics | null;
    latestPost: LatestPost | null;
    openPositions: OpenPosition[] | null;
    decisions: DecisionLogEntry[];
    /** Rows of this post are marked as new in the decisions tape. */
    highlightedPostId: string | null;
}
