import { config } from "../../config";
import { insertDecisionLog } from "../../repositories/postgres/ingestion.repository";
import {
    CandidateMarket,
    getCandidateMarketsByTopic,
    getTopicMarketMap
} from "../../repositories/postgres/trading.repository";
import { getQuoteAt } from "../../repositories/redis/marketQuote.repository";
import { CandidateAssemblyReason, DecisionOutcome, DecisionStage } from "../../shared/core/decisionLog.constants";
import { KALSHI_MARKET_STATUS } from "../kalshi";
import { computeFeePerContractCents } from "./pricing";
import { getLiveOrCachedQuote } from "./quote.service";
import { CandidateQuote, TradeDecisionInput } from "./trading.types";

const MS_PER_MINUTE = 60_000;

export type CandidateAssemblyResult =
    { pass: true; candidates: CandidateQuote[] } | { pass: false; reason: CandidateAssemblyReason };

async function enrichCandidate(candidate: CandidateMarket, signalAtMs: number): Promise<CandidateQuote> {
    const quote = await getLiveOrCachedQuote(candidate.ticker);
    const feePerContractAtAsk =
        quote.yesAskCents === null
            ? null
            : computeFeePerContractCents(quote.yesAskCents, candidate.feeType, candidate.feeMultiplier);

    const signalQuote = await getQuoteAt(candidate.ticker, signalAtMs);
    const moveSinceSignalCents =
        signalQuote?.yesAskCents === null || signalQuote?.yesAskCents === undefined || quote.yesAskCents === null
            ? null
            : quote.yesAskCents - signalQuote.yesAskCents;

    return {
        ticker: candidate.ticker,
        seriesTicker: candidate.seriesTicker,
        title: candidate.title,
        yesSubTitle: candidate.yesSubTitle,
        closeTime: candidate.closeTime,
        rulesPrimary: candidate.rulesPrimary,
        rulesSecondary: candidate.rulesSecondary,
        volume24h: candidate.volume24h,
        openInterest: candidate.openInterest,
        feeType: candidate.feeType,
        feeMultiplier: candidate.feeMultiplier,
        yesAsk: quote.yesAskCents,
        noAsk: quote.noAskCents,
        spreadCents: quote.spreadCents,
        topOfBookContracts: quote.topOfBookContracts,
        feePerContractAtAsk,
        moveSinceSignalCents
    };
}

/**
 * How far out a candidate market may close for this topic: the topic's own
 * `max_close_horizon_minutes` when set, else the global trading horizon.
 */
async function resolveMaxCloseHorizonMinutes(topic: string): Promise<number> {
    const topicMap = await getTopicMarketMap();
    const entry = topicMap.find((candidate) => candidate.topic === topic);
    return entry?.maxCloseHorizonMinutes ?? config.trading.tradingHorizonMinutes;
}

/**
 * Gate 2: deterministic, cache read. Topic -> whitelisted series -> cached
 * open markets, the classifier's target series first and then by liquidity,
 * capped at `config.trading.maxCandidates`; markets with no ask on either
 * side are dropped after the quote read.
 * `docs/backend/tradeDecision.md` §"2. Candidate assembly".
 */
export async function assembleCandidates(input: TradeDecisionInput): Promise<CandidateAssemblyResult> {
    const { post, classification } = input;
    const maxCloseHorizonMinutes = await resolveMaxCloseHorizonMinutes(classification.topic);
    const nowMs = Date.now();
    const minCloseTime = new Date(nowMs).toISOString();
    const maxCloseTime = new Date(nowMs + maxCloseHorizonMinutes * MS_PER_MINUTE).toISOString();

    const anyOpenMarket = await getCandidateMarketsByTopic({
        topic: classification.topic,
        status: KALSHI_MARKET_STATUS.ACTIVE,
        minCloseTime,
        maxCloseTime,
        minSeriesVolume: 0,
        prioritySeries: [],
        limit: 1
    });
    if (anyOpenMarket.length === 0) {
        await logNoTrade(post.id, post.platformPostId, classification, CandidateAssemblyReason.NO_OPEN_MARKET);
        return { pass: false, reason: CandidateAssemblyReason.NO_OPEN_MARKET };
    }

    const liquidMarkets = await getCandidateMarketsByTopic({
        topic: classification.topic,
        status: KALSHI_MARKET_STATUS.ACTIVE,
        minCloseTime,
        maxCloseTime,
        minSeriesVolume: config.trading.minSeriesVolume,
        prioritySeries: classification.targetSeries,
        limit: config.trading.maxCandidates
    });
    if (liquidMarkets.length === 0) {
        await logNoTrade(post.id, post.platformPostId, classification, CandidateAssemblyReason.NO_LIQUID_MARKET);
        return { pass: false, reason: CandidateAssemblyReason.NO_LIQUID_MARKET };
    }

    const signalAtMs = new Date(post.receivedAt).getTime();
    const enriched = await Promise.all(liquidMarkets.map((market) => enrichCandidate(market, signalAtMs)));
    // A market with no ask on either side cannot be bought at any price;
    // showing it to the selection agent only spends a model call on it.
    const candidates = enriched.filter(isQuoted);
    if (candidates.length === 0) {
        await logNoTrade(post.id, post.platformPostId, classification, CandidateAssemblyReason.NO_LIQUID_MARKET);
        return { pass: false, reason: CandidateAssemblyReason.NO_LIQUID_MARKET };
    }

    return { pass: true, candidates };
}

function isQuoted(candidate: CandidateQuote): boolean {
    return candidate.yesAsk !== null || candidate.noAsk !== null;
}

async function logNoTrade(
    ingestedPostId: string,
    platformPostId: string,
    classification: TradeDecisionInput["classification"],
    reason: CandidateAssemblyReason
): Promise<void> {
    await insertDecisionLog({
        ingestedPostId,
        platformPostId,
        stage: DecisionStage.TRADE_CANDIDATES,
        decision: DecisionOutcome.NO_TRADE,
        reason,
        metadata: { ...classification }
    });
}
