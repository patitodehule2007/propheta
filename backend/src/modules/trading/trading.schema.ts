import { z } from "zod";

import { NoTradeReason } from "../../shared/core/decisionLog.constants";

const noTradeReasonValues = Object.values(NoTradeReason) as [NoTradeReason, ...NoTradeReason[]];

/**
 * Structured output of the selection agent's Phase B (`docs/backend/tradeDecision.md`
 * §"Phase B - proposal prompt and schema"). Fed to `zodOutputFormat` so the
 * model's response is validated against this shape before gate 4 ever sees it.
 */
export const tradeProposalSchema = z.object({
    action: z.enum(["BUY", "NO_TRADE"]),
    ticker: z.string().nullable(),
    outcomeSide: z.enum(["YES", "NO"]).nullable(),
    fairProbability: z.number().min(0).max(1).nullable(),
    conviction: z.number().min(0).max(1),
    horizonMinutes: z.number().nullable(),
    noTradeReason: z.enum(noTradeReasonValues).nullable(),
    rejectedCandidates: z.array(z.object({ ticker: z.string(), reason: z.string() })),
    reasoning: z.string().min(1),
    inspectedTickers: z.array(z.string())
});

export type TradeProposalModelOutput = z.infer<typeof tradeProposalSchema>;
