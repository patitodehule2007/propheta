import Redis from "ioredis";

import { buildSignalText, SelectionMarkers, SignalIdentity, Signals, TestTicker } from "../helpers/tradingFixtures";
import { listDecisionStages, registerBackendWebhook, simulatePost, waitForDecision } from "../helpers/xApiMock";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
// Fixture YES ask is 42c and fees are 2c a side, so gate 4 needs a fair value
// above 0.48 to clear MIN_NET_EDGE_CENTS. 0.44 leaves a 2c edge.
const BELOW_COST_FAIR_PROBABILITY = 0.44;
// 0.5 leaves an 8c raw edge, clearing the 6c bar on its own. Under BALANCED
// (shrinkage 0.5), conviction 0.2 trusts only 60% of it: 4.8c, below the bar.
const SHRINKABLE_FAIR_PROBABILITY = 0.5;
const LOW_CONVICTION = 0.2;
/** Must match TRADE_RISK_PROFILE in docker-compose.jest.yml. */
const TEST_RISK_PROFILE = "BALANCED";

interface QuoteSample {
    tsMs: number;
    yesBidCents: number | null;
    yesAskCents: number | null;
    noBidCents: number | null;
    noAskCents: number | null;
    spreadCents: number | null;
    topOfBookContracts: number | null;
}

/** Mirrors backend/src/repositories/redis/marketQuote.repository.ts's key scheme. */
function quoteKeyFor(ticker: string): string {
    return `quote:v1:${ticker}`;
}

/** A coherent quote sample: YES bid 2c under the ask, NO prices mirrored. */
function buildQuoteSample(tsMs: number, yesAskCents: number): QuoteSample {
    const yesBidCents = yesAskCents - 2;
    return {
        tsMs,
        yesBidCents,
        yesAskCents,
        noBidCents: 100 - yesAskCents,
        noAskCents: 100 - yesBidCents,
        spreadCents: yesAskCents - yesBidCents,
        topOfBookContracts: 20
    };
}

async function postSignal(identity: SignalIdentity, markers: SelectionMarkers): Promise<string> {
    const { postId } = await simulatePost({ userId: identity.userId, text: buildSignalText(identity, markers) });
    return postId;
}

async function expectRejected(postId: string, reason: string): Promise<void> {
    const decision = await waitForDecision(postId, { stage: "RISK_VALIDATION", timeoutMs: 30000 });
    expect(decision.decision).toBe("REJECTED");
    expect(decision.reason).toBe(reason);
    expect(await listDecisionStages(postId)).not.toContain("ORDER");
}

describe("Risk validation (gate 4)", () => {
    let redis: Redis;

    beforeAll(async () => {
        const webhook = await registerBackendWebhook();
        expect(webhook.valid).toBe(true);

        redis = new Redis({
            host: process.env.REDIS_HOST ?? "redis-test",
            port: Number(process.env.REDIS_PORT ?? 6379),
            password: process.env.REDIS_PASSWORD
        });
    });

    afterAll(async () => {
        await redis.del(quoteKeyFor(TestTicker.SLIPPAGE));
        await redis.quit();
    });

    it("should reject as hallucinated_ticker when the proposed ticker is not one of the candidates", async () => {
        const postId = await postSignal(Signals.hallucinatedTicker, { ticker: TestTicker.HALLUCINATED });
        await expectRejected(postId, "hallucinated_ticker");
    }, 35000);

    it("should reject as market_not_open when the proposed side has no ask", async () => {
        const postId = await postSignal(Signals.marketNotOpen, { ticker: TestTicker.NO_ASK });
        await expectRejected(postId, "market_not_open");
    }, 35000);

    it("should reject as spread_over_limit when the spread exceeds MAX_SPREAD_CENTS", async () => {
        const postId = await postSignal(Signals.spreadOverLimit, { ticker: TestTicker.WIDE_SPREAD });
        await expectRejected(postId, "spread_over_limit");
    }, 35000);

    it("should reject as slippage_over_limit when the ask moved too far since the signal", async () => {
        // The quote poller is off in the test stack, so there is no
        // pre-signal price unless one is planted. The older sample is the
        // price at signal time; the newer one is dated in the future so it
        // stays the latest sample (the "current" quote) whenever the
        // backend reads it, without a poller to keep refreshing it.
        const nowMs = Date.now();
        const signalSample = buildQuoteSample(nowMs - MS_PER_MINUTE, 20);
        const currentSample = buildQuoteSample(nowMs + MS_PER_HOUR, 42);
        await redis.zadd(
            quoteKeyFor(TestTicker.SLIPPAGE),
            signalSample.tsMs,
            JSON.stringify(signalSample),
            currentSample.tsMs,
            JSON.stringify(currentSample)
        );

        const postId = await postSignal(Signals.slippageOverLimit, { ticker: TestTicker.SLIPPAGE });
        await expectRejected(postId, "slippage_over_limit");
    }, 35000);

    it("should reject as edge_below_cost when the fair value does not cover round-trip fees", async () => {
        const postId = await postSignal(Signals.edgeBelowCost, {
            ticker: TestTicker.BASE,
            fairProbability: BELOW_COST_FAIR_PROBABILITY
        });
        await expectRejected(postId, "edge_below_cost");
    }, 35000);

    it("should reject as edge_below_cost when low conviction shrinks the edge below cost", async () => {
        const postId = await postSignal(Signals.lowConvictionShrink, {
            ticker: TestTicker.BASE,
            fairProbability: SHRINKABLE_FAIR_PROBABILITY,
            conviction: LOW_CONVICTION
        });
        await expectRejected(postId, "edge_below_cost");

        const decision = await waitForDecision(postId, { stage: "RISK_VALIDATION", timeoutMs: 30000 });
        const edgeMetrics = decision.metadata?.edgeMetrics as Record<string, number> | undefined;
        expect(edgeMetrics?.rawEdgeCents).toBeGreaterThan(edgeMetrics?.requiredEdgeCents ?? Infinity);
        expect(edgeMetrics?.effectiveEdgeCents).toBeLessThanOrEqual(edgeMetrics?.requiredEdgeCents ?? -Infinity);
    }, 35000);

    it("should log edge metrics in ORDER metadata when the proposal is approved", async () => {
        const postId = await postSignal(Signals.edgeMetricsLogged, { ticker: TestTicker.BASE });

        const decision = await waitForDecision(postId, { stage: "ORDER", timeoutMs: 30000 });

        expect(decision.decision).toBe("ORDER_SIMULATED");
        expect(decision.metadata?.edgeMetrics).toEqual(
            expect.objectContaining({
                rawEdgeCents: expect.any(Number),
                effectiveEdgeCents: expect.any(Number),
                requiredEdgeCents: expect.any(Number),
                conviction: expect.any(Number),
                edgeShrinkage: expect.any(Number),
                riskProfile: TEST_RISK_PROFILE
            })
        );
    }, 35000);

    it("should reject as exposure_cap_trade when top-of-book depth sizes the order below one contract", async () => {
        const postId = await postSignal(Signals.exposureCapTrade, { ticker: TestTicker.THIN_BOOK });
        await expectRejected(postId, "exposure_cap_trade");
    }, 35000);
});

describe("Execution (gate 5)", () => {
    beforeAll(async () => {
        const webhook = await registerBackendWebhook();
        expect(webhook.valid).toBe(true);
    });

    it("should reject as closing_too_soon without opening a position when the close buffer leaves no horizon", async () => {
        const postId = await postSignal(Signals.closingTooSoon, { ticker: TestTicker.CLOSING_SOON });
        await expectRejected(postId, "closing_too_soon");
    }, 35000);
});
