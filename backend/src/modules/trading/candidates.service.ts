import { config } from "../../config";
import { insertDecisionLog } from "../../repositories/postgres/ingestion.repository";
import { CandidateMarket, getCandidateMarketsByTopic } from "../../repositories/postgres/trading.repository";
import { getQuoteAt } from "../../repositories/redis/marketQuote.repository";
import { CandidateAssemblyReason, DecisionOutcome, DecisionStage } from "../../shared/core/decisionLog.constants";
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
 * Gate 2: deterministic, cache read. Topic -> tags -> cached series -> open
 * markets, ranked by liquidity and capped at `config.trading.maxCandidates`.
 * `docs/backend/tradeDecision.md` §"2. Candidate assembly".
 */
export async function assembleCandidates(input: TradeDecisionInput): Promise<CandidateAssemblyResult> {
    const { post, classification } = input;
    const maxCloseTime = new Date(Date.now() + config.trading.tradingHorizonMinutes * MS_PER_MINUTE).toISOString();

    const anyOpenMarket = await getCandidateMarketsByTopic({
        topic: classification.topic,
        maxCloseTime,
        minSeriesVolume: 0,
        limit: 1
    });
    if (anyOpenMarket.length === 0) {
        await logNoTrade(post.id, post.platformPostId, classification, CandidateAssemblyReason.NO_OPEN_MARKET);
        return { pass: false, reason: CandidateAssemblyReason.NO_OPEN_MARKET };
    }

    const liquidMarkets = await getCandidateMarketsByTopic({
        topic: classification.topic,
        maxCloseTime,
        minSeriesVolume: config.trading.minSeriesVolume,
        limit: config.trading.maxCandidates
    });
    if (liquidMarkets.length === 0) {
        await logNoTrade(post.id, post.platformPostId, classification, CandidateAssemblyReason.NO_LIQUID_MARKET);
        return { pass: false, reason: CandidateAssemblyReason.NO_LIQUID_MARKET };
    }

    const signalAtMs = new Date(post.receivedAt).getTime();
    const candidates = await Promise.all(liquidMarkets.map((market) => enrichCandidate(market, signalAtMs)));

    return { pass: true, candidates };
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
