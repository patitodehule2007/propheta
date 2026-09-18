/**
 * Vocabulary of the `decision_log` audit trail, shared by every pipeline stage.
 *
 * Lives in `shared/core` rather than inside the ingestion or trading module
 * because several modules write these values: the orchestrator imports
 * ingestion, and the trading module imports neither — a module-local home for
 * them would create a circular dependency.
 *
 * Mirrors the operation state machine in
 * `docs/projectDefenition/initial_investigation.md` §6.1 and the six-gate
 * flow in `docs/backend/tradeDecision.md`.
 */

/**
 * Closed set of `decision_log.stage` values. A stage is a point in the
 * post-processing flow where the backend decides to record an outcome.
 *
 * `TRADE_CANDIDATES` covers both the pre-gate (topic/direction/confidence/
 * novelty/kill-switch/rate-limit) and candidate assembly (market matching) —
 * both are deterministic and run before the one LLM call, per
 * `docs/backend/tradeDecision.md`.
 */
export const DecisionStage = {
    TWEET_RECEIVED: "TWEET_RECEIVED",
    LINKS_ENRICHED: "LINKS_ENRICHED",
    AGENT_ANALYSIS: "AGENT_ANALYSIS",
    TRADE_CANDIDATES: "TRADE_CANDIDATES",
    TRADE_DECISION: "TRADE_DECISION",
    RISK_VALIDATION: "RISK_VALIDATION",
    ORDER: "ORDER",
    EXIT: "EXIT"
} as const;

export type DecisionStage = (typeof DecisionStage)[keyof typeof DecisionStage];

/**
 * Closed set of `decision_log.decision` values, shared across every stage.
 */
export const DecisionOutcome = {
    INGESTED: "INGESTED",
    DISCARDED: "DISCARDED",
    ENRICHED: "ENRICHED",
    CLASSIFIED: "CLASSIFIED",
    PROPOSED: "PROPOSED",
    NO_TRADE: "NO_TRADE",
    REJECTED: "REJECTED",
    ORDER_PLACED: "ORDER_PLACED",
    ORDER_SIMULATED: "ORDER_SIMULATED",
    ORDER_FAILED: "ORDER_FAILED",
    EXIT_TIME_LIMIT: "EXIT_TIME_LIMIT",
    EXIT_STOP_LOSS: "EXIT_STOP_LOSS",
    EXIT_TAKE_PROFIT: "EXIT_TAKE_PROFIT",
    EXIT_MARKET_CLOSE: "EXIT_MARKET_CLOSE",
    EXIT_FAILED: "EXIT_FAILED"
} as const;

export type DecisionOutcome = (typeof DecisionOutcome)[keyof typeof DecisionOutcome];

/**
 * Why a post was discarded before ever reaching the trading gates. Values
 * stay lower_snake_case because they are the existing `reason` wire contract
 * read by `GET /api/webhooks/x/decisions`.
 */
export const DiscardReason = {
    INVALID_SIGNATURE: "invalid_signature",
    AUTHOR_NOT_MONITORED: "author_not_monitored",
    DUPLICATE_POST: "duplicate_post",
    AGENT_ERROR: "agent_error"
} as const;

export type DiscardReason = (typeof DiscardReason)[keyof typeof DiscardReason];

/**
 * Deterministic `NO_TRADE` reasons produced by gate 1 (pre-gate), zero
 * tokens. `docs/backend/tradeDecision.md` §"1. Pre-gate".
 */
export const PreGateReason = {
    TOPIC_NOT_TRADABLE: "topic_not_tradable",
    DIRECTION_UNCLEAR: "direction_unclear",
    LOW_CONFIDENCE: "low_confidence",
    NO_NOVELTY: "no_novelty",
    KILL_SWITCH: "kill_switch",
    ORDER_RATE_LIMIT: "order_rate_limit"
} as const;

export type PreGateReason = (typeof PreGateReason)[keyof typeof PreGateReason];

/**
 * Deterministic `NO_TRADE` reasons produced by gate 2 (candidate assembly), a
 * cache read. `docs/backend/tradeDecision.md` §"2. Candidate assembly".
 */
export const CandidateAssemblyReason = {
    NO_OPEN_MARKET: "no_open_market",
    NO_LIQUID_MARKET: "no_liquid_market"
} as const;

export type CandidateAssemblyReason = (typeof CandidateAssemblyReason)[keyof typeof CandidateAssemblyReason];

/**
 * `NO_TRADE` reasons the selection agent (gate 3) is allowed to emit. Model-
 * facing — part of `tradeProposalSchema`'s `noTradeReason` enum. Disjoint
 * from `VetoReason`, which the model can never produce.
 */
export const NoTradeReason = {
    NO_MATCHING_MARKET: "no_matching_market",
    RULES_MISMATCH: "rules_mismatch",
    ALREADY_PRICED_IN: "already_priced_in",
    INSUFFICIENT_EDGE: "insufficient_edge",
    SPREAD_TOO_WIDE: "spread_too_wide",
    CLOSING_TOO_SOON: "closing_too_soon",
    LOW_CONVICTION: "low_conviction"
} as const;

export type NoTradeReason = (typeof NoTradeReason)[keyof typeof NoTradeReason];

/**
 * `REJECTED` veto reasons produced only by gate 4 (risk validation), never by
 * the model — never part of any schema the model fills in.
 */
export const VetoReason = {
    HALLUCINATED_TICKER: "hallucinated_ticker",
    MARKET_NOT_OPEN: "market_not_open",
    EDGE_BELOW_COST: "edge_below_cost",
    SPREAD_OVER_LIMIT: "spread_over_limit",
    SLIPPAGE_OVER_LIMIT: "slippage_over_limit",
    EXPOSURE_CAP_TRADE: "exposure_cap_trade",
    EXPOSURE_CAP_TOPIC: "exposure_cap_topic",
    DAILY_LOSS_KILL_SWITCH: "daily_loss_kill_switch",
    ORDER_RATE_LIMIT: "order_rate_limit",
    INSUFFICIENT_BALANCE: "insufficient_balance",
    DRY_RUN: "dry_run",
    // Not in docs/backend/tradeDecision.md's veto table (which lists this
    // under NoTradeReason, model-emittable) -- but the exit-policy section
    // explicitly assigns this same failure to gate 4 when the close-buffer
    // clamp drives the horizon below EXIT_HORIZON_MIN_MINUTES, a case the
    // model never sees. Kept here as the code-only occurrence of the reason.
    CLOSING_TOO_SOON: "closing_too_soon"
} as const;

export type VetoReason = (typeof VetoReason)[keyof typeof VetoReason];

/**
 * Why a position closed. Code-produced only, written at gate 6 (exit
 * supervision), never part of any model schema.
 */
export const ExitReason = {
    TIME_LIMIT: "time_limit",
    STOP_LOSS: "stop_loss",
    TAKE_PROFIT: "take_profit",
    MARKET_CLOSE: "market_close",
    KILL_SWITCH: "kill_switch",
    EXIT_FAILED: "exit_failed"
} as const;

export type ExitReason = (typeof ExitReason)[keyof typeof ExitReason];

/**
 * Cap on post text copied into `decision_log.metadata`. Discarded posts have no
 * `ingested_posts` row to reference, so their text is preserved here — but an
 * unsigned payload is attacker-controlled and must not be stored unbounded.
 */
export const MAX_AUDITED_TEXT_LENGTH = 500;
