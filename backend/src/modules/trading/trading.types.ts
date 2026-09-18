import { IngestedPost } from "../../repositories/postgres/ingestion.repository";
import { PostClassification } from "../agent/agent.schema";

/**
 * What the orchestrator hands the trade-decision pipeline once a post has
 * been classified.
 */
export interface TradeDecisionInput {
    post: IngestedPost;
    handle: string;
    classification: PostClassification;
}

/**
 * One gate-2 candidate, enriched with the numbers the selection agent must
 * never derive itself: the ask (bids-only book), spread, top-of-book size,
 * the fee at that price, and how far the price has moved since the signal.
 */
export interface CandidateQuote {
    ticker: string;
    seriesTicker: string;
    title: string;
    yesSubTitle: string;
    closeTime: string;
    rulesPrimary: string;
    rulesSecondary: string;
    volume24h: number;
    openInterest: number;
    feeType: string;
    feeMultiplier: number;
    yesAsk: number | null;
    noAsk: number | null;
    spreadCents: number | null;
    topOfBookContracts: number | null;
    feePerContractAtAsk: number | null;
    moveSinceSignalCents: number | null;
}
