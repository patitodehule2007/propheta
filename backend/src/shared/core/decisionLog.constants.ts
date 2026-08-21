/**
 * Closed set of `decision_log.stage` values. A pipeline stage is a point in
 * the post-processing flow where the backend decides to record an outcome.
 */
export const DecisionStage = {
    TWEET_RECEIVED: "TWEET_RECEIVED",
    AGENT_ANALYSIS: "AGENT_ANALYSIS"
} as const;

export type DecisionStage = (typeof DecisionStage)[keyof typeof DecisionStage];

/**
 * Closed set of `decision_log.decision` values, shared across every stage.
 */
export const DecisionOutcome = {
    INGESTED: "INGESTED",
    CLASSIFIED: "CLASSIFIED",
    DISCARDED: "DISCARDED"
} as const;

export type DecisionOutcome = (typeof DecisionOutcome)[keyof typeof DecisionOutcome];
