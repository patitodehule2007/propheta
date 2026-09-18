import { randomUUID } from "crypto";
import { registerBackendWebhook, simulatePost, waitForDecision } from "../helpers/xApiMock";

const ANTHROPIC_MOCK_URL = process.env.ANTHROPIC_BASE_URL ?? "http://anthropic-mock-test:4200";

// Distinct monitored accounts per test so the pre-gate's novelty heuristic
// (same author, same topic, same direction within the window) never fires
// between unrelated test cases -- see database/init/sql/seed/ingestion_accounts.sql.
const JD_VANCE_USER_ID = "210437201";
const WHITE_HOUSE_USER_ID = "1349149096909668362";

describe("Trade decision pipeline", () => {
    beforeAll(async () => {
        const webhook = await registerBackendWebhook();
        expect(webhook.valid).toBe(true);
    });

    it(
        "should log ORDER_SIMULATED with a full exit policy when a candidate market matches",
        async () => {
            const linkedUrl = `${ANTHROPIC_MOCK_URL}/fixtures/tariffs.html`;
            const { postId } = await simulatePost({
                userId: JD_VANCE_USER_ID,
                text: `New tariffs coming, read more: ${linkedUrl} (${randomUUID()})`
            });

            const decision = await waitForDecision(postId, { stage: "ORDER", timeoutMs: 30000 });

            expect(decision.decision).toBe("ORDER_SIMULATED");
            expect(decision.reason).toBeNull();
            expect(decision.metadata?.ticker).toBe("KXTARIFF-25-A");
            expect(decision.metadata?.outcomeSide).toBe("YES");
            expect(decision.metadata?.deadlineAt).toEqual(expect.any(String));
            expect(decision.metadata?.stopPriceCents).toEqual(expect.any(Number));
            expect(decision.metadata?.targetPriceCents).toEqual(expect.any(Number));
            expect(decision.metadata?.horizonSource).toBe("TOPIC_TABLE");
        },
        35000
    );

    it(
        "should log NO_TRADE at TRADE_CANDIDATES when no cached market matches the topic",
        async () => {
            const { postId } = await simulatePost({
                userId: WHITE_HOUSE_USER_ID,
                text: `A new immigration policy was announced today. [[topic:IMMIGRATION]] (${randomUUID()})`
            });

            const decision = await waitForDecision(postId, { stage: "TRADE_CANDIDATES", timeoutMs: 30000 });

            expect(decision.decision).toBe("NO_TRADE");
            expect(decision.reason).toBe("no_open_market");
        },
        35000
    );

    it(
        "should log NO_TRADE at TRADE_CANDIDATES when confidence is below the pre-gate threshold",
        async () => {
            const linkedUrl = `${ANTHROPIC_MOCK_URL}/fixtures/tariffs.html`;
            const { postId } = await simulatePost({
                userId: JD_VANCE_USER_ID,
                text: `Maybe tariffs, who knows: ${linkedUrl} [[confidence:0.1]] (${randomUUID()})`
            });

            const decision = await waitForDecision(postId, { stage: "TRADE_CANDIDATES", timeoutMs: 30000 });

            expect(decision.decision).toBe("NO_TRADE");
            expect(decision.reason).toBe("low_confidence");
        },
        35000
    );
});
