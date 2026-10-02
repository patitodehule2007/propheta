import { buildOrderbookWithYesBid, resetKalshiMock, setMarketCloseTime, setOrderbook } from "../helpers/kalshiMock";
import { buildSignalText, SelectionMarkers, SignalIdentity, Signals, TestTicker } from "../helpers/tradingFixtures";
import { registerBackendWebhook, simulatePost, waitForDecision, waitForExitDecision } from "../helpers/xApiMock";

const MS_PER_MINUTE = 60_000;
const MIN_PRICE_CENTS = 1;
const MAX_PRICE_CENTS = 99;
// Comfortably inside the backend's EXIT_CLOSE_BUFFER_MINUTES (30).
const INSIDE_CLOSE_BUFFER_MINUTES = 10;
// With EXIT_HORIZON_MODEL_WEIGHT=1 in the test stack, the mocked model's
// horizon becomes the position's deadline: ~6s.
const SHORT_HORIZON_MINUTES = 0.1;

interface OpenedPosition {
    positionId: string;
    stopPriceCents: number | null;
    targetPriceCents: number;
    deadlineAt: string;
}

function toOpenedPosition(metadata: Record<string, unknown> | null): OpenedPosition {
    const positionId = metadata?.positionId;
    const stopPriceCents = metadata?.stopPriceCents;
    const targetPriceCents = metadata?.targetPriceCents;
    const deadlineAt = metadata?.deadlineAt;

    if (
        typeof positionId !== "string" ||
        (stopPriceCents !== null && typeof stopPriceCents !== "number") ||
        typeof targetPriceCents !== "number" ||
        typeof deadlineAt !== "string"
    ) {
        throw new Error(`ORDER metadata is missing exit-policy fields: ${JSON.stringify(metadata)}`);
    }
    return { positionId, stopPriceCents, targetPriceCents, deadlineAt };
}

/** Drives a post through gates 1-5 and returns the simulated position it opened. */
async function openSimulatedPosition(identity: SignalIdentity, markers: SelectionMarkers): Promise<OpenedPosition> {
    const { postId } = await simulatePost({ userId: identity.userId, text: buildSignalText(identity, markers) });
    const order = await waitForDecision(postId, { stage: "ORDER", timeoutMs: 30000 });
    expect(order.decision).toBe("ORDER_SIMULATED");
    expect(order.metadata?.ticker).toBe(markers.ticker);
    return toOpenedPosition(order.metadata);
}

describe("Exit supervision (gate 6)", () => {
    beforeAll(async () => {
        const webhook = await registerBackendWebhook();
        expect(webhook.valid).toBe(true);
    });

    afterEach(async () => {
        await resetKalshiMock();
    });

    it(
        "should close at a loss with EXIT_STOP_LOSS when the held-side bid falls to the stop",
        async () => {
            const position = await openSimulatedPosition(Signals.stopLoss, { ticker: TestTicker.STOP_LOSS });
            expect(position.stopPriceCents).not.toBeNull();
            const bidCents = Math.max((position.stopPriceCents ?? MIN_PRICE_CENTS) - 1, MIN_PRICE_CENTS);

            await setOrderbook(TestTicker.STOP_LOSS, buildOrderbookWithYesBid(bidCents));
            const exit = await waitForExitDecision(position.positionId);

            expect(exit.decision).toBe("EXIT_STOP_LOSS");
            expect(exit.reason).toBe("stop_loss");
            expect(exit.metadata?.ticker).toBe(TestTicker.STOP_LOSS);
            expect(exit.metadata?.exitPriceCents).toBe(bidCents);
            expect(exit.metadata?.realizedPnlCents).toBeLessThan(0);
            expect(exit.metadata?.isDryRun).toBe(true);
        },
        50000
    );

    it(
        "should close at a profit with EXIT_TAKE_PROFIT when the held-side bid reaches the target",
        async () => {
            const position = await openSimulatedPosition(Signals.takeProfit, { ticker: TestTicker.TAKE_PROFIT });
            const bidCents = Math.min(position.targetPriceCents + 1, MAX_PRICE_CENTS);

            await setOrderbook(TestTicker.TAKE_PROFIT, buildOrderbookWithYesBid(bidCents));
            const exit = await waitForExitDecision(position.positionId);

            expect(exit.decision).toBe("EXIT_TAKE_PROFIT");
            expect(exit.reason).toBe("take_profit");
            expect(exit.metadata?.ticker).toBe(TestTicker.TAKE_PROFIT);
            expect(exit.metadata?.exitPriceCents).toBe(bidCents);
            expect(exit.metadata?.realizedPnlCents).toBeGreaterThan(0);
        },
        50000
    );

    it(
        "should close with EXIT_TIME_LIMIT when the position's deadline passes with no price trigger",
        async () => {
            const position = await openSimulatedPosition(Signals.timeLimit, {
                ticker: TestTicker.TIME_LIMIT,
                horizonMinutes: SHORT_HORIZON_MINUTES
            });
            expect(new Date(position.deadlineAt).getTime() - Date.now()).toBeLessThan(MS_PER_MINUTE);

            const exit = await waitForExitDecision(position.positionId, { timeoutMs: 20000 });

            expect(exit.decision).toBe("EXIT_TIME_LIMIT");
            expect(exit.reason).toBe("time_limit");
            expect(exit.metadata?.ticker).toBe(TestTicker.TIME_LIMIT);
            expect(exit.metadata?.exitPriceCents).toEqual(expect.any(Number));
        },
        55000
    );

    it(
        "should close with EXIT_MARKET_CLOSE when the market's close time moves inside the close buffer",
        async () => {
            const position = await openSimulatedPosition(Signals.marketClose, { ticker: TestTicker.MARKET_CLOSE });

            await setMarketCloseTime(
                TestTicker.MARKET_CLOSE,
                new Date(Date.now() + INSIDE_CLOSE_BUFFER_MINUTES * MS_PER_MINUTE)
            );
            const exit = await waitForExitDecision(position.positionId, { timeoutMs: 20000 });

            expect(exit.decision).toBe("EXIT_MARKET_CLOSE");
            expect(exit.reason).toBe("market_close");
            expect(exit.metadata?.ticker).toBe(TestTicker.MARKET_CLOSE);
            expect(exit.metadata?.exitPriceCents).toEqual(expect.any(Number));
        },
        55000
    );
});
