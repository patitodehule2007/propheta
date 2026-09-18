import { config } from "../../config";
import { insertDecisionLog } from "../../repositories/postgres/ingestion.repository";
import {
    countRecentOrders,
    getRealizedPnlSince,
    getRecentClassificationsByHandle
} from "../../repositories/postgres/trading.repository";
import { DecisionOutcome, DecisionStage, PreGateReason } from "../../shared/core/decisionLog.constants";
import { AgentDirection, AgentTopic } from "../agent/agent.constants";
import { TradeDecisionInput } from "./trading.types";

const MS_PER_HOUR = 3_600_000;

export type PreGateResult = { pass: true } | { pass: false; reason: PreGateReason };

async function logNoTrade(input: TradeDecisionInput, reason: PreGateReason): Promise<void> {
    await insertDecisionLog({
        ingestedPostId: input.post.id,
        platformPostId: input.post.platformPostId,
        stage: DecisionStage.TRADE_CANDIDATES,
        decision: DecisionOutcome.NO_TRADE,
        reason,
        metadata: { ...input.classification }
    });
}

/**
 * Gate 1: deterministic, zero tokens. Reads only the classification the agent
 * module already produced plus cheap DB reads -- most posts die here without
 * a second API call. `docs/backend/tradeDecision.md` §"1. Pre-gate".
 */
export async function runPreGate(input: TradeDecisionInput): Promise<PreGateResult> {
    const { classification, post, handle } = input;

    if (classification.topic === AgentTopic.NONE) {
        await logNoTrade(input, PreGateReason.TOPIC_NOT_TRADABLE);
        return { pass: false, reason: PreGateReason.TOPIC_NOT_TRADABLE };
    }

    if (classification.direction === AgentDirection.UNCLEAR) {
        await logNoTrade(input, PreGateReason.DIRECTION_UNCLEAR);
        return { pass: false, reason: PreGateReason.DIRECTION_UNCLEAR };
    }

    if (classification.confidence < config.trading.minConfidence) {
        await logNoTrade(input, PreGateReason.LOW_CONFIDENCE);
        return { pass: false, reason: PreGateReason.LOW_CONFIDENCE };
    }

    // Novelty heuristic (v1): same author, same topic, same direction within
    // the novelty window. Logged under its own reason so a future embedding-
    // based detector can be graded against it (open decision 3).
    const since = new Date(Date.now() - config.trading.noveltyWindowHours * MS_PER_HOUR).toISOString();
    const recent = await getRecentClassificationsByHandle({
        handle,
        topic: classification.topic,
        since,
        limit: 10
    });
    const repeatsExisting = recent.some(
        (entry) => entry.platformPostId !== post.platformPostId && entry.direction === classification.direction
    );
    if (repeatsExisting) {
        await logNoTrade(input, PreGateReason.NO_NOVELTY);
        return { pass: false, reason: PreGateReason.NO_NOVELTY };
    }

    // Daily-loss kill switch (§6.3).
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const realizedPnlCents = await getRealizedPnlSince(startOfDay.toISOString());
    const dailyLossLimitCents = -Math.abs((config.trading.maxDailyLossPct / 100) * config.trading.capitalBaseCents);
    if (realizedPnlCents <= dailyLossLimitCents) {
        await logNoTrade(input, PreGateReason.KILL_SWITCH);
        return { pass: false, reason: PreGateReason.KILL_SWITCH };
    }

    // Order-rate loop guard (§6.3).
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const recentOrders = await countRecentOrders(oneMinuteAgo);
    if (recentOrders >= config.trading.maxOrdersPerMinute) {
        await logNoTrade(input, PreGateReason.ORDER_RATE_LIMIT);
        return { pass: false, reason: PreGateReason.ORDER_RATE_LIMIT };
    }

    return { pass: true };
}
