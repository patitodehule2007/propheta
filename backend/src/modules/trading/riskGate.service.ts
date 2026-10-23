import { config } from "../../config";
import { getKalshiMarketByTicker, getOpenExposureByTopic } from "../../repositories/postgres/trading.repository";
import { VetoReason } from "../../shared/core/decisionLog.constants";
import { KALSHI_MARKET_STATUS } from "../kalshi";
import { computeFeePerContractCents } from "./pricing";
import { getLiveOrCachedQuote } from "./quote.service";
import { CandidateQuote, TradeDecisionInput } from "./trading.types";
import { TradeProposalModelOutput } from "./trading.schema";

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
      }
    | { approved: false; reason: VetoReason };

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
        return { approved: false, reason: VetoReason.HALLUCINATED_TICKER };
    }

    const candidate = candidates.find((entry) => entry.ticker === ticker);
    if (!candidate) {
        return { approved: false, reason: VetoReason.HALLUCINATED_TICKER };
    }

    const market = await getKalshiMarketByTicker(ticker);
    if (!market || market.status !== KALSHI_MARKET_STATUS.ACTIVE) {
        return { approved: false, reason: VetoReason.MARKET_NOT_OPEN };
    }

    // Re-fetch: the LLM call may have taken seconds, the candidate's own
    // quote can be stale.
    const quote = await getLiveOrCachedQuote(ticker);
    const entryPriceCents = outcomeSide === "YES" ? quote.yesAskCents : quote.noAskCents;
    if (entryPriceCents === null || quote.spreadCents === null) {
        return { approved: false, reason: VetoReason.MARKET_NOT_OPEN };
    }

    if (quote.spreadCents > config.trading.maxSpreadCents) {
        return { approved: false, reason: VetoReason.SPREAD_OVER_LIMIT };
    }

    if (
        candidate.moveSinceSignalCents !== null &&
        Math.abs(candidate.moveSinceSignalCents) > config.trading.maxSlippageCents
    ) {
        return { approved: false, reason: VetoReason.SLIPPAGE_OVER_LIMIT };
    }

    const entryFeeCents = computeFeePerContractCents(entryPriceCents, market.feeType, market.feeMultiplier);
    // Exit price is not known yet; the entry fee is used as the best available
    // estimate of the exit fee too (both trade near the same price region).
    const expectedExitFeeCents = entryFeeCents;

    const fairPriceCentsOnSide = outcomeSide === "YES" ? fairProbability * 100 : (1 - fairProbability) * 100;
    const edgeCents = fairPriceCentsOnSide - entryPriceCents;
    const requiredEdgeCents = entryFeeCents + expectedExitFeeCents + config.trading.minNetEdgeCents;
    if (edgeCents <= requiredEdgeCents) {
        return { approved: false, reason: VetoReason.EDGE_BELOW_COST };
    }

    const topicExposureCents = await getOpenExposureByTopic(input.classification.topic);
    const topicCapCents = (config.trading.maxTopicExposurePct / 100) * config.trading.capitalBaseCents;
    const remainingTopicBudgetCents = topicCapCents - topicExposureCents;
    if (remainingTopicBudgetCents <= 0) {
        return { approved: false, reason: VetoReason.EXPOSURE_CAP_TOPIC };
    }

    const tradeCapCents = (config.trading.maxTradeExposurePct / 100) * config.trading.capitalBaseCents;
    const depthCapCents = (quote.topOfBookContracts ?? 0) * entryPriceCents;
    const sizeCapCents = Math.min(tradeCapCents, remainingTopicBudgetCents, depthCapCents);
    const contracts = Math.floor(sizeCapCents / entryPriceCents);
    if (contracts < 1) {
        return { approved: false, reason: VetoReason.EXPOSURE_CAP_TRADE };
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
        closeTime: market.closeTime
    };
}
