import { buildSignalText, Signals } from "../helpers/tradingFixtures";
import { listDecisionStages, registerBackendWebhook, simulatePost, waitForDecision } from "../helpers/xApiMock";

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

            const decision = await waitForDecision(postId, { stage: "TRADE_CANDIDATES", timeoutMs: 30000 });

            expect(decision.decision).toBe("NO_TRADE");
            expect(decision.reason).toBe("no_liquid_market");
            expect(await listDecisionStages(postId)).not.toContain("TRADE_DECISION");
        },
        35000
    );
});
