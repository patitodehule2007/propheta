import { insertDecisionLog } from "../../repositories/postgres/ingestion.repository";
import {
    getTopicMarketMap,
    insertTradeProposal,
    updateTradeProposalStatus
} from "../../repositories/postgres/trading.repository";
import { DecisionOutcome, DecisionStage, DiscardReason } from "../../shared/core/decisionLog.constants";
import { logger } from "../../shared/services/logger";
import { assembleCandidates } from "./candidates.service";
import { computeDeterministicHorizon } from "./exitPolicy.service";
import { executeApprovedTrade } from "./execution.service";
import { runPreGate } from "./preGate.service";
import { runRiskGate } from "./riskGate.service";
import { runSelectionAgent } from "./selectionAgent.service";
import { TradeProposalStatus } from "./trading.constants";
import { TradeDecisionInput } from "./trading.types";

/**
 * Sequences the six gates after `AGENT_ANALYSIS`, per `docs/backend/tradeDecision.md`.
 * Every gate writes its own `decision_log` row and may end the flow here;
 * never throws -- called fire-and-forget from the orchestrator.
 */
export async function runTradeDecision(input: TradeDecisionInput): Promise<void> {
    try {
        const preGate = await runPreGate(input);
        if (!preGate.pass) return;

        const candidateResult = await assembleCandidates(input);
        if (!candidateResult.pass) return;

        const selection = await runSelectionAgent(input, candidateResult.candidates);
        if (!selection.ok) {
            await insertDecisionLog({
                ingestedPostId: input.post.id,
                platformPostId: input.post.platformPostId,
                stage: DecisionStage.TRADE_DECISION,
                decision: DecisionOutcome.NO_TRADE,
                reason: DiscardReason.AGENT_ERROR,
                metadata: null
            });
            return;
        }

        const { proposal } = selection;
        const isBuy = proposal.action === "BUY";

        const savedProposal = await insertTradeProposal({
            ingestedPostId: input.post.id,
            topic: input.classification.topic,
            direction: input.classification.direction,
            confidence: input.classification.confidence,
            action: proposal.action,
            ticker: proposal.ticker,
            outcomeSide: proposal.outcomeSide,
            fairProbability: proposal.fairProbability,
            conviction: proposal.conviction,
            horizonModelMinutes: proposal.horizonMinutes,
            noTradeReason: isBuy ? null : proposal.noTradeReason,
            status: isBuy ? TradeProposalStatus.PROPOSED : TradeProposalStatus.NO_TRADE,
            reasoning: proposal.reasoning,
            candidateTickers: candidateResult.candidates.map((candidate) => candidate.ticker),
            inspectedTickers: proposal.inspectedTickers,
            rejectedCandidates: proposal.rejectedCandidates
        });

        await insertDecisionLog({
            ingestedPostId: input.post.id,
            platformPostId: input.post.platformPostId,
            stage: DecisionStage.TRADE_DECISION,
            decision: isBuy ? DecisionOutcome.PROPOSED : DecisionOutcome.NO_TRADE,
            reason: isBuy ? null : proposal.noTradeReason,
            metadata: {
                ticker: proposal.ticker,
                outcomeSide: proposal.outcomeSide,
                conviction: proposal.conviction,
                reasoning: proposal.reasoning,
                toolCallCount: selection.toolCallCount,
                stopReason: selection.stopReason
            }
        });

        if (!isBuy) return;

        const risk = await runRiskGate(input, proposal, candidateResult.candidates);
        if (!risk.approved) {
            await updateTradeProposalStatus({
                id: savedProposal.id,
                status: TradeProposalStatus.REJECTED,
                vetoReason: risk.reason
            });
            await insertDecisionLog({
                ingestedPostId: input.post.id,
                platformPostId: input.post.platformPostId,
                stage: DecisionStage.RISK_VALIDATION,
                decision: DecisionOutcome.REJECTED,
                reason: risk.reason,
                metadata: { ticker: proposal.ticker }
            });
            return;
        }

        const topicMap = await getTopicMarketMap();
        const defaultHorizonMinutes = topicMap.find(
            (entry) => entry.topic === input.classification.topic
        )?.defaultHorizonMinutes;

        const horizon = await computeDeterministicHorizon({
            ticker: risk.ticker,
            entryPriceCents: risk.entryPriceCents,
            fairProbability: proposal.fairProbability ?? 0,
            defaultHorizonMinutes: defaultHorizonMinutes ?? 60
        });

        await executeApprovedTrade({ tradeProposalId: savedProposal.id, input, proposal, risk, horizon });
    } catch (err) {
        logger.error({ err, platformPostId: input.post.platformPostId }, "Trade decision pipeline failed");
    }
}
