import { randomUUID } from "crypto";
import { registerBackendWebhook, simulatePost, waitForDecision } from "../helpers/xApiMock";

const ANTHROPIC_MOCK_URL = process.env.ANTHROPIC_BASE_URL ?? "http://anthropic-mock-test:4200";
const MONITORED_USER_ID = "25073877"; // realDonaldTrump, seeded in database/init/sql/seed/ingestion_accounts.sql

describe("Agent post-analysis", () => {
    beforeAll(async () => {
        const webhook = await registerBackendWebhook();
        expect(webhook.valid).toBe(true);
    });

    it("should log a CLASSIFIED decision after reading a linked fixture page", async () => {
        const linkedUrl = `${ANTHROPIC_MOCK_URL}/fixtures/tariffs.html`;
        const { postId } = await simulatePost({
            userId: MONITORED_USER_ID,
            text: `New tariffs coming, read more: ${linkedUrl} (${randomUUID()})`
        });

        const decision = await waitForDecision(postId, { stage: "AGENT_ANALYSIS", timeoutMs: 20000 });

        expect(decision.decision).toBe("CLASSIFIED");
        expect(decision.reason).toBeNull();
        expect(decision.metadata).not.toBeNull();
        expect(decision.metadata?.topic).toBe("TARIFFS_TRADE");
        expect(decision.metadata?.direction).toBe("INCREASES");
        expect(decision.metadata?.sourceUrls).toContain(linkedUrl);
    });
});
