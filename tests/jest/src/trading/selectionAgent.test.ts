import { buildSignalText, Signals } from "../helpers/tradingFixtures";
import { listDecisionStages, registerBackendWebhook, simulatePost, waitForDecision } from "../helpers/xApiMock";

describe("Selection agent (gate 3)", () => {
    beforeAll(async () => {
        const webhook = await registerBackendWebhook();
        expect(webhook.valid).toBe(true);
    });

    it(
        "should log NO_TRADE with the model's reason and stop when the model declines every candidate",
        async () => {
            const identity = Signals.modelNoTrade;
            const { postId } = await simulatePost({
                userId: identity.userId,
                text: buildSignalText(identity, { selection: "no_trade" })
            });

            const decision = await waitForDecision(postId, { stage: "TRADE_DECISION", timeoutMs: 30000 });

            expect(decision.decision).toBe("NO_TRADE");
            expect(decision.reason).toBe("rules_mismatch");
            expect(decision.metadata?.ticker).toBeNull();
            expect(await listDecisionStages(postId)).not.toContain("RISK_VALIDATION");
        },
        35000
    );

    it(
        "should log NO_TRADE agent_error when the proposal does not match the schema",
        async () => {
            const identity = Signals.agentError;
            const { postId } = await simulatePost({
                userId: identity.userId,
                text: buildSignalText(identity, { selection: "invalid" })
            });

            const decision = await waitForDecision(postId, { stage: "TRADE_DECISION", timeoutMs: 30000 });

            expect(decision.decision).toBe("NO_TRADE");
            expect(decision.reason).toBe("agent_error");
            expect(await listDecisionStages(postId)).not.toContain("RISK_VALIDATION");
        },
        35000
    );
});
