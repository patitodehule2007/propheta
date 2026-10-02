import { buildSignalText, SignalIdentity, Signals } from "../helpers/tradingFixtures";
import { listDecisionStages, registerBackendWebhook, simulatePost, waitForDecision } from "../helpers/xApiMock";

async function postSignal(identity: SignalIdentity): Promise<string> {
    const { postId } = await simulatePost({ userId: identity.userId, text: buildSignalText(identity) });
    return postId;
}

describe("Pre-gate (gate 1)", () => {
    beforeAll(async () => {
        const webhook = await registerBackendWebhook();
        expect(webhook.valid).toBe(true);
    });

    it(
        "should log NO_TRADE topic_not_tradable without reaching the selection agent when the topic is NONE",
        async () => {
            const postId = await postSignal(Signals.topicNotTradable);

            const decision = await waitForDecision(postId, { stage: "TRADE_CANDIDATES", timeoutMs: 30000 });

            expect(decision.decision).toBe("NO_TRADE");
            expect(decision.reason).toBe("topic_not_tradable");
            expect(await listDecisionStages(postId)).not.toContain("TRADE_DECISION");
        },
        35000
    );

    it(
        "should log NO_TRADE direction_unclear without reaching the selection agent when the direction is UNCLEAR",
        async () => {
            const postId = await postSignal(Signals.directionUnclear);

            const decision = await waitForDecision(postId, { stage: "TRADE_CANDIDATES", timeoutMs: 30000 });

            expect(decision.decision).toBe("NO_TRADE");
            expect(decision.reason).toBe("direction_unclear");
            expect(await listDecisionStages(postId)).not.toContain("TRADE_DECISION");
        },
        35000
    );

    it(
        "should log NO_TRADE no_novelty when the same author repeats a topic and direction within the window",
        async () => {
            const firstPostId = await postSignal(Signals.novelty);
            // The first post's classification must be in decision_log before
            // the repeat reaches gate 1; its own gate 2 outcome is irrelevant.
            await waitForDecision(firstPostId, { stage: "TRADE_CANDIDATES", timeoutMs: 30000 });

            const repeatPostId = await postSignal(Signals.novelty);
            const decision = await waitForDecision(repeatPostId, { stage: "TRADE_CANDIDATES", timeoutMs: 30000 });

            expect(decision.decision).toBe("NO_TRADE");
            expect(decision.reason).toBe("no_novelty");
        },
        65000
    );
});
