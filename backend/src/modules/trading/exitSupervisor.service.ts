import { config } from "../../config";
import { insertDecisionLog } from "../../repositories/postgres/ingestion.repository";
import {
    closePosition,
    getKalshiMarketByTicker,
    getOpenPositions,
    OpenPosition,
    updatePositionPeakFavourable
} from "../../repositories/postgres/trading.repository";
import { DecisionOutcome, DecisionStage, ExitReason } from "../../shared/core/decisionLog.constants";
import { logger } from "../../shared/services/logger";
import { kalshiService } from "../kalshi";
import { minutesUntilClose } from "./exitPolicy.service";
import { computeFeePerContractCents } from "./pricing";
import { getLiveOrCachedQuote } from "./quote.service";

let sweepTimer: ReturnType<typeof setInterval> | null = null;

interface ExitTrigger {
    reason: ExitReason;
    exitPriceCents: number;
}

/**
 * Precedence when several triggers land on the same tick: market close first
 * (capital preservation), then stop loss, then take profit, then the time
 * limit. `docs/backend/tradeDecision.md` §"Enforcement".
 */
function determineExitTrigger(
    position: OpenPosition,
    bidCents: number | null,
    minutesToClose: number,
    nowMs: number
): ExitTrigger | null {
    if (minutesToClose <= config.trading.exit.closeBufferMinutes) {
        return { reason: ExitReason.MARKET_CLOSE, exitPriceCents: bidCents ?? position.entryFillCents };
    }
    if (position.stopPriceCents !== null && bidCents !== null && bidCents <= position.stopPriceCents) {
        return { reason: ExitReason.STOP_LOSS, exitPriceCents: bidCents };
    }
    if (bidCents !== null && bidCents >= position.targetPriceCents) {
        return { reason: ExitReason.TAKE_PROFIT, exitPriceCents: bidCents };
    }
    if (nowMs >= new Date(position.deadlineAt).getTime()) {
        return { reason: ExitReason.TIME_LIMIT, exitPriceCents: bidCents ?? position.entryFillCents };
    }
    return null;
}

const EXIT_OUTCOME_BY_REASON: Record<ExitReason, (typeof DecisionOutcome)[keyof typeof DecisionOutcome]> = {
    [ExitReason.MARKET_CLOSE]: DecisionOutcome.EXIT_MARKET_CLOSE,
    [ExitReason.STOP_LOSS]: DecisionOutcome.EXIT_STOP_LOSS,
    [ExitReason.TAKE_PROFIT]: DecisionOutcome.EXIT_TAKE_PROFIT,
    [ExitReason.TIME_LIMIT]: DecisionOutcome.EXIT_TIME_LIMIT,
    [ExitReason.KILL_SWITCH]: DecisionOutcome.EXIT_MARKET_CLOSE,
    [ExitReason.EXIT_FAILED]: DecisionOutcome.EXIT_FAILED
};

function clampExitPrice(priceCents: number): number {
    return Math.min(Math.max(priceCents, 1), 99);
}

/**
 * Best-effort closing order: the opposite book side of the entry, priced
 * through the bid by `EXIT_SLIPPAGE_CENTS` so it is marketable.
 *
 * Open decision 8 in `docs/backend/tradeDecision.md`: this exact mapping
 * (which `book_side` closes an existing position under Kalshi's V2 netted
 * account model) is flagged in the doc as needing confirmation before
 * implementation -- it is the one place this design knowingly loosens the
 * limit-only rule (§6.3), and it must be verified against a live account
 * before `DRY_RUN=false` is ever used for real capital.
 */
async function submitCloseOrder(position: OpenPosition, exitPriceCents: number): Promise<boolean> {
    try {
        const oppositeSide = position.outcomeSide === "YES" ? "ask" : "bid";
        const slippageBoundedCents = clampExitPrice(
            position.outcomeSide === "YES"
                ? exitPriceCents - config.trading.exit.slippageCents
                : exitPriceCents + config.trading.exit.slippageCents
        );

        await kalshiService.createOrder({
            ticker: position.ticker,
            side: oppositeSide,
            count: String(position.contracts),
            price: (slippageBoundedCents / 100).toFixed(2),
            time_in_force: "immediate_or_cancel",
            self_trade_prevention_type: "taker_at_cross"
        });
        return true;
    } catch (err) {
        logger.error({ err, ticker: position.ticker, positionId: position.id }, "Exit order submission failed");
        return false;
    }
}

async function closeWithTrigger(
    position: OpenPosition,
    trigger: ExitTrigger,
    feeType: string,
    feeMultiplier: number
): Promise<void> {
    if (!position.isDryRun) {
        const submitted = await submitCloseOrder(position, trigger.exitPriceCents);
        if (!submitted) {
            await insertDecisionLog({
                ingestedPostId: null,
                platformPostId: null,
                stage: DecisionStage.EXIT,
                decision: DecisionOutcome.EXIT_FAILED,
                reason: ExitReason.EXIT_FAILED,
                metadata: { positionId: position.id, ticker: position.ticker, triggerReason: trigger.reason }
            });
            return; // position stays open, retried next sweep
        }
    }

    const exitFeePerContract = computeFeePerContractCents(trigger.exitPriceCents, feeType, feeMultiplier);
    const realizedPnlCents =
        (trigger.exitPriceCents - position.entryFillCents) * position.contracts -
        position.entryFeeCents * position.contracts -
        exitFeePerContract * position.contracts;

    const closed = await closePosition({
        positionId: position.id,
        closedAt: new Date().toISOString(),
        exitReason: trigger.reason,
        exitPriceCents: trigger.exitPriceCents,
        realizedPnlCents
    });
    if (!closed) return; // already closed by a concurrent trigger

    await insertDecisionLog({
        ingestedPostId: null,
        platformPostId: null,
        stage: DecisionStage.EXIT,
        decision: EXIT_OUTCOME_BY_REASON[trigger.reason],
        reason: trigger.reason,
        metadata: {
            positionId: position.id,
            ticker: position.ticker,
            exitPriceCents: trigger.exitPriceCents,
            realizedPnlCents,
            isDryRun: position.isDryRun
        }
    });
}

async function processPosition(position: OpenPosition, nowMs: number): Promise<void> {
    const market = await getKalshiMarketByTicker(position.ticker);
    const minutesToClose = market ? minutesUntilClose(market.closeTime) : Number.POSITIVE_INFINITY;

    const quote = await getLiveOrCachedQuote(position.ticker);
    const bidCents = position.outcomeSide === "YES" ? quote.yesBidCents : quote.noBidCents;

    const trigger = determineExitTrigger(position, bidCents, minutesToClose, nowMs);

    if (!trigger) {
        if (bidCents !== null) {
            const favourableCents = bidCents - position.entryFillCents;
            if (position.peakFavourableCents === null || favourableCents > position.peakFavourableCents) {
                await updatePositionPeakFavourable(position.id, favourableCents);
            }
        }
        return;
    }

    await closeWithTrigger(position, trigger, market?.feeType ?? "quadratic", market?.feeMultiplier ?? 0.07);
}

/**
 * Gate 6: evaluates every open position against stop, target, deadline and
 * market-close buffer, and closes whichever triggers first. Run on
 * `config.trading.exit.sweepIntervalMs` -- infrastructure cadence, not
 * business flow control; the deadline itself is persisted in Postgres and is
 * the source of truth, so a restart loses nothing.
 */
export async function evaluateExitsOnce(): Promise<void> {
    const positions = await getOpenPositions();
    if (positions.length === 0) return;

    const nowMs = Date.now();
    await Promise.all(
        positions.map((position) =>
            processPosition(position, nowMs).catch((err) => {
                logger.error({ err, positionId: position.id }, "Exit evaluation failed for position");
            })
        )
    );
}

/** Starts the exit-supervision sweep. */
export function startExitSupervisor(): void {
    if (sweepTimer) return;
    sweepTimer = setInterval(() => {
        void evaluateExitsOnce();
    }, config.trading.exit.sweepIntervalMs);
    logger.info({ intervalMs: config.trading.exit.sweepIntervalMs }, "Exit supervisor started");
}

/** Stops the exit-supervision sweep. Used by tests and graceful shutdown. */
export function stopExitSupervisor(): void {
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = null;
}
