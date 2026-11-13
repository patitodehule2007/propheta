import { randomUUID } from "crypto";
import { ANTHROPIC_MOCK_URL, getClassifierPrompt } from "../helpers/anthropicMock";
import { registerBackendWebhook, simulatePost, waitForDecision } from "../helpers/xApiMock";

const MONITORED_USER_ID = "25073877"; // realDonaldTrump, seeded in database/init/sql/seed/ingestion_accounts.sql
const MONITORED_HANDLE = "realDonaldTrump";
const ANALYSIS_TIMEOUT_MS = 20000;
// Stops the post at the pre-gate (topic_not_tradable), so these prompt checks
// never reach the trading stages or feed another test's novelty window.
const STOP_AT_PRE_GATE_MARKER = "[[topic:NONE]]";

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

        const decision = await waitForDecision(postId, { stage: "AGENT_ANALYSIS", timeoutMs: ANALYSIS_TIMEOUT_MS });

        expect(decision.decision).toBe("CLASSIFIED");
        expect(decision.reason).toBeNull();
        expect(decision.metadata).not.toBeNull();
        expect(decision.metadata?.topic).toBe("TARIFFS_TRADE");
        expect(decision.metadata?.direction).toBe("INCREASES");
        expect(decision.metadata?.sourceUrls).toContain(linkedUrl);
    });

    it("should include the author handle and post time in the classifier prompt when a post is analyzed", async () => {
        const marker = randomUUID();
        const { postId } = await simulatePost({
            userId: MONITORED_USER_ID,
            text: `A statement for the prompt check. ${STOP_AT_PRE_GATE_MARKER} (${marker})`
        });
        await waitForDecision(postId, { stage: "AGENT_ANALYSIS", timeoutMs: ANALYSIS_TIMEOUT_MS });

        const prompt = await getClassifierPrompt(marker);

        expect(prompt).toMatch(new RegExp(`<post author="@${MONITORED_HANDLE}" posted_at="[^"]+">`));
        expect(prompt).toMatch(/Current time: \d{4}-\d{2}-\d{2}T/);
    });

    it("should list each topic's tracked markets in the classifier prompt when the whitelist has series", async () => {
        const marker = randomUUID();
        const { postId } = await simulatePost({
            userId: MONITORED_USER_ID,
            text: `A statement for the tracked-markets check. ${STOP_AT_PRE_GATE_MARKER} (${marker})`
        });
        await waitForDecision(postId, { stage: "AGENT_ANALYSIS", timeoutMs: ANALYSIS_TIMEOUT_MS });

        const prompt = await getClassifierPrompt(marker);

        expect(prompt).toContain("<tracked_markets>");
        // Ticker plus cached title, or the bare ticker before the cache has fetched the series.
        expect(prompt).toMatch(/TARIFFS_TRADE:\n- KXTARIFF(: Tariff announcements)?\n/);
        // The test whitelist deliberately gives IMMIGRATION no series.
        expect(prompt).toContain("IMMIGRATION: (no tracked markets)");
    });

    it("should store targetEvent in the CLASSIFIED decision metadata when classification succeeds", async () => {
        const targetEvent = "Will the US raise its tariff rate on Mexico?";
        const { postId } = await simulatePost({
            userId: MONITORED_USER_ID,
            text: `Tariff threat. [[event:${targetEvent}]] ${STOP_AT_PRE_GATE_MARKER} (${randomUUID()})`
        });

        const decision = await waitForDecision(postId, { stage: "AGENT_ANALYSIS", timeoutMs: ANALYSIS_TIMEOUT_MS });

        expect(decision.decision).toBe("CLASSIFIED");
        expect(decision.metadata?.targetEvent).toBe(targetEvent);
    });
});
