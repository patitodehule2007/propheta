import { randomUUID } from "crypto";

import { config } from "../../config";
import { insertDecisionLog } from "../../repositories/postgres/ingestion.repository";
import {
    insertOrder,
    insertPosition,
    updateOrderAfterSubmit,
    updateTradeProposalStatus
} from "../../repositories/postgres/trading.repository";
import { DecisionOutcome, DecisionStage, VetoReason } from "../../shared/core/decisionLog.constants";
import { ExternalServiceError } from "../../shared/core/errors";
import { logger } from "../../shared/services/logger";
import { kalshiService } from "../kalshi";
import {
    blendHorizonMinutes,
    clampHorizonMinutes,
    computeStopPolicy,
    computeTargetPriceCents,
    minutesUntilClose
} from "./exitPolicy.service";
import { RiskGateResult } from "./riskGate.service";
import { TradeOrderStatus } from "./trading.constants";
import { TradeDecisionInput } from "./trading.types";
import { TradeProposalModelOutput } from "./trading.schema";

const KALSHI_HTTP_CONFLICT = 409;

export interface ExecutionInput {
    tradeProposalId: string;
    input: TradeDecisionInput;
    proposal: TradeProposalModelOutput;
    risk: Extract<RiskGateResult, { approved: true }>;
    /** Deterministic horizon computed by gate 4, before this gate runs. */
    horizon: { minutes: number; source: string; atrCents: number | null };
}

/**
 * Gate 5: computes the final exit policy, mints the client_order_id and
 * persists the order + position before anything (outside dry-run) goes over
 * the wire, then either simulates the fill (`DRY_RUN`, the default) or
 * submits to Kalshi, treating a 409 (duplicate client_order_id, e.g. a
 * retried call after a network timeout) as idempotent success.
 *
 * v1 simplification: there is no fills feed yet (§5.6, phase two), so a
 * successful submission is assumed to fill at the limit price sent. A
 * partial or delayed fill is not reconciled -- a documented gap, not a
 * silent one.
 */
export async function executeApprovedTrade(exec: ExecutionInput): Promise<void> {
    const { tradeProposalId, input, proposal, risk } = exec;

    const hRaw = blendHorizonMinutes(proposal.horizonMinutes, exec.horizon.minutes);
    const minutesUntilCloseValue = minutesUntilClose(risk.closeTime);
    const horizonMinutes = clampHorizonMinutes(hRaw, minutesUntilCloseValue);

    if (horizonMinutes < config.trading.exit.horizonMinMinutes) {
        await updateTradeProposalStatus({
            id: tradeProposalId,
            status: "REJECTED",
            vetoReason: VetoReason.CLOSING_TOO_SOON
        });
        await writeRiskValidationLog(input, VetoReason.CLOSING_TOO_SOON);
        return;
    }

    // The schema does not constrain horizonMinutes to an integer; the DB
    // column does.
    const horizonModelMinutes = proposal.horizonMinutes === null ? null : Math.round(proposal.horizonMinutes);

    const stopPolicy = computeStopPolicy(risk.entryPriceCents, exec.horizon.atrCents);
    const targetPriceCents = computeTargetPriceCents({
        entryFillCents: risk.entryPriceCents,
        fairProbability: proposal.fairProbability ?? 0,
        entryFeeCents: risk.entryFeeCents,
        expectedExitFeeCents: risk.expectedExitFeeCents
    });

    await updateTradeProposalStatus({ id: tradeProposalId, status: "EXECUTED", vetoReason: null });

    const clientOrderId = randomUUID();
    const isDryRun = config.dryRun;
    const now = new Date().toISOString();
    const deadlineAt = new Date(Date.now() + horizonMinutes * 60_000).toISOString();

    const order = await insertOrder({
        tradeProposalId,
        clientOrderId,
        kalshiOrderId: null,
        ticker: risk.ticker,
        outcomeSide: risk.outcomeSide,
        limitPriceCents: risk.entryPriceCents,
        contracts: risk.contracts,
        status: isDryRun ? TradeOrderStatus.SIMULATED : TradeOrderStatus.SUBMITTED,
        isDryRun,
        tsMs: null
    });
    if (!order) {
        // client_order_id collision on a fresh randomUUID() is effectively
        // impossible; treat it the same as any other retried-call dedup.
        logger.warn({ clientOrderId }, "insert_order returned no row for a freshly minted client_order_id");
        return;
    }

    if (isDryRun) {
        await insertPositionAndLog({
            orderId: order.id,
            tradeProposalId,
            input,
            risk,
            stopPolicy,
            targetPriceCents,
            horizonMinutes,
            horizonSource: exec.horizon.source,
            horizonModelMinutes,
            horizonDeterministicMinutes: exec.horizon.minutes,
            atrCents: exec.horizon.atrCents,
            openedAt: now,
            deadlineAt,
            isDryRun: true,
            decisionOutcome: DecisionOutcome.ORDER_SIMULATED
        });
        return;
    }

    try {
        const response = await kalshiService.createOrder({
            ticker: risk.ticker,
            side: risk.outcomeSide === "YES" ? "bid" : "ask",
            count: String(risk.contracts),
            price: (risk.entryPriceCents / 100).toFixed(2),
            time_in_force: "immediate_or_cancel",
            self_trade_prevention_type: "taker_at_cross",
            client_order_id: clientOrderId
        });

        await updateOrderAfterSubmit({
            clientOrderId,
            kalshiOrderId: response.order_id,
            status: TradeOrderStatus.FILLED,
            tsMs: response.ts_ms
        });

        await insertPositionAndLog({
            orderId: order.id,
            tradeProposalId,
            input,
            risk,
            stopPolicy,
            targetPriceCents,
            horizonMinutes,
            horizonSource: exec.horizon.source,
            horizonModelMinutes,
            horizonDeterministicMinutes: exec.horizon.minutes,
            atrCents: exec.horizon.atrCents,
            openedAt: now,
            deadlineAt,
            isDryRun: false,
            decisionOutcome: DecisionOutcome.ORDER_PLACED
        });
    } catch (err) {
        if (err instanceof ExternalServiceError && err.upstreamStatus === KALSHI_HTTP_CONFLICT) {
            // client_order_id already exists on Kalshi's side -- the earlier
            // attempt landed, this is a retried call after e.g. a network
            // timeout. Treated as idempotent success, per §5.5.
            await insertPositionAndLog({
                orderId: order.id,
                tradeProposalId,
                input,
                risk,
                stopPolicy,
                targetPriceCents,
                horizonMinutes,
                horizonSource: exec.horizon.source,
                horizonModelMinutes,
                horizonDeterministicMinutes: exec.horizon.minutes,
                atrCents: exec.horizon.atrCents,
                openedAt: now,
                deadlineAt,
                isDryRun: false,
                decisionOutcome: DecisionOutcome.ORDER_PLACED
            });
            return;
        }

        logger.error({ err, clientOrderId, ticker: risk.ticker }, "Order submission failed");
        await updateOrderAfterSubmit({
            clientOrderId,
            kalshiOrderId: null,
            status: TradeOrderStatus.FAILED,
            tsMs: null
        });
        await insertDecisionLog({
            ingestedPostId: input.post.id,
            platformPostId: input.post.platformPostId,
            stage: DecisionStage.ORDER,
            decision: DecisionOutcome.ORDER_FAILED,
            reason: null,
            metadata: { ticker: risk.ticker, clientOrderId }
        });
    }
}

interface PositionAndLogParams {
    orderId: string;
    tradeProposalId: string;
    input: TradeDecisionInput;
    risk: Extract<RiskGateResult, { approved: true }>;
    stopPolicy: { stopDistanceCents: number; stopPriceCents: number | null };
    targetPriceCents: number;
    horizonMinutes: number;
    horizonSource: string;
    horizonModelMinutes: number | null;
    horizonDeterministicMinutes: number;
    atrCents: number | null;
    openedAt: string;
    deadlineAt: string;
    isDryRun: boolean;
    decisionOutcome: (typeof DecisionOutcome)[keyof typeof DecisionOutcome];
}

async function insertPositionAndLog(params: PositionAndLogParams): Promise<void> {
    const position = await insertPosition({
        orderId: params.orderId,
        tradeProposalId: params.tradeProposalId,
        topic: params.input.classification.topic,
        ticker: params.risk.ticker,
        outcomeSide: params.risk.outcomeSide,
        contracts: params.risk.contracts,
        entryFillCents: params.risk.entryPriceCents,
        entryFeeCents: params.risk.entryFeeCents,
        deadlineAt: params.deadlineAt,
        stopPriceCents: params.stopPolicy.stopPriceCents,
        targetPriceCents: params.targetPriceCents,
        horizonSource: params.horizonSource,
        horizonModelMinutes: params.horizonModelMinutes,
        horizonDeterministicMinutes: params.horizonDeterministicMinutes,
        atrCents: params.atrCents,
        openedAt: params.openedAt,
        isDryRun: params.isDryRun
    });

    await insertDecisionLog({
        ingestedPostId: params.input.post.id,
        platformPostId: params.input.post.platformPostId,
        stage: DecisionStage.ORDER,
        decision: params.decisionOutcome,
        reason: null,
        metadata: {
            ticker: params.risk.ticker,
            outcomeSide: params.risk.outcomeSide,
            contracts: params.risk.contracts,
            entryPriceCents: params.risk.entryPriceCents,
            positionId: position.id,
            deadlineAt: params.deadlineAt,
            stopPriceCents: params.stopPolicy.stopPriceCents,
            targetPriceCents: params.targetPriceCents,
            horizonSource: params.horizonSource
        }
    });
}

async function writeRiskValidationLog(input: TradeDecisionInput, reason: VetoReason): Promise<void> {
    await insertDecisionLog({
        ingestedPostId: input.post.id,
        platformPostId: input.post.platformPostId,
        stage: DecisionStage.RISK_VALIDATION,
        decision: DecisionOutcome.REJECTED,
        reason,
        metadata: { ...input.classification }
    });
}
