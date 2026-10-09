import { randomUUID } from "crypto";
import { loginAsAdmin } from "../helpers/auth";
import { listDecisionStages, registerBackendWebhook, simulatePost, waitForDecision } from "../helpers/xApiMock";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend-test:5000";

const MONITORED_USER_ID = "25073877"; // realDonaldTrump, seeded in database/init/sql/seed/ingestion_accounts.sql
const UNMONITORED_USER_ID = "9999999999";

describe("X webhook ingestion", () => {
    beforeAll(async () => {
        const webhook = await registerBackendWebhook();
        expect(webhook.valid).toBe(true);
    });

    it("should return the CRC response_token when challenged", async () => {
        const crcToken = randomUUID();
        const response = await fetch(`${BACKEND_URL}/api/webhooks/x?crc_token=${crcToken}`);
        const body = (await response.json()) as { response_token: string };

        expect(response.status).toBe(200);
        expect(body.response_token).toMatch(/^sha256=/);
    });

    it("should log an INGESTED decision when a monitored author posts", async () => {
        const { postId } = await simulatePost({
            userId: MONITORED_USER_ID,
            text: `tariffs announcement ${randomUUID()}`
        });

        const decision = await waitForDecision(postId, { stage: "TWEET_RECEIVED" });

        expect(decision.stage).toBe("TWEET_RECEIVED");
        expect(decision.decision).toBe("INGESTED");
        expect(decision.reason).toBeNull();
    });

    it("should discard with reason author_not_monitored when the author is not monitored", async () => {
        const { postId } = await simulatePost({ userId: UNMONITORED_USER_ID, text: `random post ${randomUUID()}` });

        const decision = await waitForDecision(postId);

        expect(decision.decision).toBe("DISCARDED");
        expect(decision.reason).toBe("author_not_monitored");
    });

    it("should record a link but not scrape it when the URL targets a blocked host", async () => {
        // Post text is untrusted input: the SSRF guard must stop the backend being
        // aimed at the cloud metadata endpoint, while still recording the attempt.
        const { postId } = await simulatePost({
            userId: MONITORED_USER_ID,
            text: `leak http://169.254.169.254/latest/meta-data ${randomUUID()}`
        });

        const decision = await waitForDecision(postId, { stage: "LINKS_ENRICHED" });

        expect(decision.decision).toBe("ENRICHED");
        expect(decision.metadata).toMatchObject({ urlsFound: 1, urlsScraped: 0 });
    });

    it("should not log a LINKS_ENRICHED decision when an ingested post has no links", async () => {
        const { postId } = await simulatePost({
            userId: MONITORED_USER_ID,
            text: `plain announcement ${randomUUID()}`
        });

        await waitForDecision(postId, { stage: "TWEET_RECEIVED" });
        const stages = await listDecisionStages(postId);

        expect(stages).toEqual(["TWEET_RECEIVED"]);
    });

    it("should discard with reason invalid_signature when the webhook signature is wrong", async () => {
        const { postId, deliveryStatus } = await simulatePost({
            userId: MONITORED_USER_ID,
            text: `forged post ${randomUUID()}`,
            corruptSignature: true
        });

        expect(deliveryStatus).toBe(401);

        const decision = await waitForDecision(postId);
        expect(decision.decision).toBe("DISCARDED");
        expect(decision.reason).toBe("invalid_signature");
    });

    it("should return 401 when reading decisions without a session", async () => {
        const response = await fetch(`${BACKEND_URL}/api/webhooks/x/decisions`);

        expect(response.status).toBe(401);
    });

    it("should return 401 when registering the webhook without a session", async () => {
        const response = await fetch(`${BACKEND_URL}/api/webhooks/x/registration`, { method: "POST" });

        expect(response.status).toBe(401);
    });

    it("should return 200 when reading decisions with a valid session", async () => {
        const response = await fetch(`${BACKEND_URL}/api/webhooks/x/decisions`, {
            headers: { Cookie: await loginAsAdmin() }
        });

        expect(response.status).toBe(200);
    });
});
