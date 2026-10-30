import { config, RiskProfile } from "../../config";
import { getKalshiMarketByTicker, getOpenExposureByTopic } from "../../repositories/postgres/trading.repository";
import { VetoReason } from "../../shared/core/decisionLog.constants";
import { KALSHI_MARKET_STATUS } from "../kalshi";
import { computeEdge, computeFeePerContractCents, EdgeMetrics } from "./pricing";
import { getLiveOrCachedQuote } from "./quote.service";
import { CandidateQuote, TradeDecisionInput } from "./trading.types";
import { TradeProposalModelOutput } from "./trading.schema";

/** Edge arithmetic plus the profile it ran under -- logged so a decision can be replayed under another profile. */
export interface RiskEdgeMetrics extends EdgeMetrics {
    riskProfile: RiskProfile;
}

export type RiskGateResult =
    | {
          approved: true;
          ticker: string;
          outcomeSide: "YES" | "NO";
          entryPriceCents: number;
          contracts: number;
          entryFeeCents: number;
          expectedExitFeeCents: number;
          feeType: string;
          feeMultiplier: number;
          closeTime: string;
          edgeMetrics: RiskEdgeMetrics;
      }
    | { approved: false; reason: VetoReason; edgeMetrics: RiskEdgeMetrics | null };

function veto(reason: VetoReason, edgeMetrics: RiskEdgeMetrics | null = null): RiskGateResult {
    return { approved: false, reason, edgeMetrics };
}

/**
 * Gate 4, the veto layer -- deterministic and authoritative. Only called when
 * the selection agent proposed BUY. `docs/backend/tradeDecision.md`
 * §"4. Risk validation and order shaping".
 *
 * Daily-loss kill switch and order-rate limiting are already enforced,
 * cheaper, in gate 1 (before the LLM call was ever spent) and are not
 * repeated here.
 */
export async function runRiskGate(
    input: TradeDecisionInput,
    proposal: TradeProposalModelOutput,
    candidates: CandidateQuote[]
): Promise<RiskGateResult> {
    const ticker = proposal.ticker;
    const outcomeSide = proposal.outcomeSide;
    const fairProbability = proposal.fairProbability;

    if (!ticker || !outcomeSide || fairProbability === null) {
        return veto(VetoReason.HALLUCINATED_TICKER);
    }

    const candidate = candidates.find((entry) => entry.ticker === ticker);
    if (!candidate) {
        return veto(VetoReason.HALLUCINATED_TICKER);
    }

    const market = await getKalshiMarketByTicker(ticker);
    if (!market || market.status !== KALSHI_MARKET_STATUS.ACTIVE) {
        return veto(VetoReason.MARKET_NOT_OPEN);
    }

    // Re-fetch: the LLM call may have taken seconds, the candidate's own
    // quote can be stale.
    const quote = await getLiveOrCachedQuote(ticker);
    const entryPriceCents = outcomeSide === "YES" ? quote.yesAskCents : quote.noAskCents;
    if (entryPriceCents === null || quote.spreadCents === null) {
        return veto(VetoReason.MARKET_NOT_OPEN);
    }

    if (quote.spreadCents > config.trading.maxSpreadCents) {
        return veto(VetoReason.SPREAD_OVER_LIMIT);
    }

    if (
        candidate.moveSinceSignalCents !== null &&
        Math.abs(candidate.moveSinceSignalCents) > config.trading.maxSlippageCents
    ) {
        return veto(VetoReason.SLIPPAGE_OVER_LIMIT);
    }

    const entryFeeCents = computeFeePerContractCents(entryPriceCents, market.feeType, market.feeMultiplier);
    // Exit price is not known yet; the entry fee is used as the best available
    // estimate of the exit fee too (both trade near the same price region).
    const expectedExitFeeCents = entryFeeCents;

    const edgeMetrics: RiskEdgeMetrics = {
        ...computeEdge({
            fairProbability,
            conviction: proposal.conviction,
            outcomeSide,
            entryPriceCents,
            roundTripFeeCents: entryFeeCents + expectedExitFeeCents,
            minNetEdgeCents: config.trading.minNetEdgeCents,
            edgeShrinkage: config.trading.edgeShrinkage
        }),
        riskProfile: config.trading.riskProfile
    };
    if (edgeMetrics.effectiveEdgeCents <= edgeMetrics.requiredEdgeCents) {
        return veto(VetoReason.EDGE_BELOW_COST, edgeMetrics);
    }

    const topicExposureCents = await getOpenExposureByTopic(input.classification.topic);
    const topicCapCents = (config.trading.maxTopicExposurePct / 100) * config.trading.capitalBaseCents;
    const remainingTopicBudgetCents = topicCapCents - topicExposureCents;
    if (remainingTopicBudgetCents <= 0) {
        return veto(VetoReason.EXPOSURE_CAP_TOPIC, edgeMetrics);
    }

    const tradeCapCents = (config.trading.maxTradeExposurePct / 100) * config.trading.capitalBaseCents;
    const depthCapCents = (quote.topOfBookContracts ?? 0) * entryPriceCents;
    const sizeCapCents = Math.min(tradeCapCents, remainingTopicBudgetCents, depthCapCents);
    const contracts = Math.floor(sizeCapCents / entryPriceCents);
    if (contracts < 1) {
        return veto(VetoReason.EXPOSURE_CAP_TRADE, edgeMetrics);
    }

    return {
        approved: true,
        ticker,
        outcomeSide,
        entryPriceCents,
        contracts,
        entryFeeCents,
        expectedExitFeeCents,
        feeType: market.feeType,
        feeMultiplier: market.feeMultiplier,
        closeTime: market.closeTime,
        edgeMetrics
    };
}
