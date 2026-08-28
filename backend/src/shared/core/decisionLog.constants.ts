/**
 * Vocabulary of the `decision_log` audit trail, shared by every pipeline stage.
 *
 * Lives in `shared/core` rather than inside the ingestion or decision-pipeline
 * module because both write these values: the orchestrator imports ingestion,
 * so a module-local home for them would create a circular dependency.
 *
 * Mirrors the operation state machine in
 * `docs/projectDefenition/initial_investigation.md` §6.1.
 */

/**
 * Where in the state machine a `decision_log` row was written.
 */
export const PipelineStage = {
    TWEET_RECEIVED: "TWEET_RECEIVED",
    LINKS_ENRICHED: "LINKS_ENRICHED"
} as const;

export type PipelineStage = (typeof PipelineStage)[keyof typeof PipelineStage];

/**
 * What the stage decided to do with the post.
 */
export const Decision = {
    INGESTED: "INGESTED",
    DISCARDED: "DISCARDED",
    ENRICHED: "ENRICHED"
} as const;

export type Decision = (typeof Decision)[keyof typeof Decision];

/**
 * Why a post was discarded. Values stay lower_snake_case because they are the
 * existing `reason` wire contract read by `GET /api/webhooks/x/decisions`.
 */
export const DiscardReason = {
    INVALID_SIGNATURE: "invalid_signature",
    AUTHOR_NOT_MONITORED: "author_not_monitored",
    DUPLICATE_POST: "duplicate_post"
} as const;

export type DiscardReason = (typeof DiscardReason)[keyof typeof DiscardReason];

/**
 * Cap on post text copied into `decision_log.metadata`. Discarded posts have no
 * `ingested_posts` row to reference, so their text is preserved here — but an
 * unsigned payload is attacker-controlled and must not be stored unbounded.
 */
export const MAX_AUDITED_TEXT_LENGTH = 500;
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
