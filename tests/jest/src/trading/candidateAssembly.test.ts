import { getSelectionCandidateTickers } from "../helpers/anthropicMock";
import { buildSignalText, Signals } from "../helpers/tradingFixtures";
import { listDecisionStages, registerBackendWebhook, simulatePost, waitForDecision } from "../helpers/xApiMock";

// kalshi-mock tariff markets (mocks/kalshi-mock/src/state.ts).
const MEXICO_TARIFF_SERIES = "KXTARIFFMEX";
const MEXICO_TARIFF_TICKER = "KXTARIFFMEX-26-A";
const HIGHEST_VOLUME_TARIFF_TICKER = "KXTARIFF-25-A";
const EMPTY_BOOK_TARIFF_TICKER = "KXTARIFF-25-EMPTY";
const DECISION_TIMEOUT_MS = 30000;
const TEST_TIMEOUT_MS = 35000;

describe("Candidate assembly (gate 2)", () => {
    beforeAll(async () => {
        const webhook = await registerBackendWebhook();
        expect(webhook.valid).toBe(true);
    });

    it(
        "should log NO_TRADE no_liquid_market when every matching series is below the volume floor",
        async () => {
            const identity = Signals.noLiquidMarket;
            const { postId } = await simulatePost({ userId: identity.userId, text: buildSignalText(identity) });

            const decision = await waitForDecision(postId, {
                stage: "TRADE_CANDIDATES",
                timeoutMs: DECISION_TIMEOUT_MS
            });

            expect(decision.decision).toBe("NO_TRADE");
            expect(decision.reason).toBe("no_liquid_market");
            expect(await listDecisionStages(postId)).not.toContain("TRADE_DECISION");
        },
        TEST_TIMEOUT_MS
    );

    it(
        "should rank the classifier's target series first when it names one with lower volume",
        async () => {
            const identity = Signals.targetSeriesFirst;
            const text = buildSignalText(identity, { targetSeries: [MEXICO_TARIFF_SERIES], selection: "no_trade" });
            const { postId } = await simulatePost({ userId: identity.userId, text });
            await waitForDecision(postId, { stage: "TRADE_DECISION", timeoutMs: DECISION_TIMEOUT_MS });

            const tickers = await getSelectionCandidateTickers(text);

            expect(tickers[0]).toBe(MEXICO_TARIFF_TICKER);
            expect(tickers).toContain(HIGHEST_VOLUME_TARIFF_TICKER);
        },
        TEST_TIMEOUT_MS
    );

    it(
        "should leave a market out of the candidates when it has no ask on either side",
        async () => {
            const identity = Signals.unquotedMarketDropped;
            const text = buildSignalText(identity, { selection: "no_trade" });
            const { postId } = await simulatePost({ userId: identity.userId, text });
            await waitForDecision(postId, { stage: "TRADE_DECISION", timeoutMs: DECISION_TIMEOUT_MS });

            const tickers = await getSelectionCandidateTickers(text);

            expect(tickers[0]).toBe(HIGHEST_VOLUME_TARIFF_TICKER);
            expect(tickers).not.toContain(EMPTY_BOOK_TARIFF_TICKER);
        },
        TEST_TIMEOUT_MS
    );
});
