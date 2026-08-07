import { randomUUID } from "crypto";
import { registerBackendWebhook, simulatePost, waitForDecision } from "../helpers/xApiMock";

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

        const decision = await waitForDecision(postId);

        expect(decision.stage).toBe("TWEET_RECIBIDO");
        expect(decision.decision).toBe("INGESTED");
        expect(decision.reason).toBeNull();
    });

    it("should discard with reason author_not_monitored when the author is not monitored", async () => {
        const { postId } = await simulatePost({ userId: UNMONITORED_USER_ID, text: `random post ${randomUUID()}` });

        const decision = await waitForDecision(postId);

        expect(decision.decision).toBe("DESCARTADO");
        expect(decision.reason).toBe("author_not_monitored");
    });

    it("should discard with reason invalid_signature when the webhook signature is wrong", async () => {
        const { postId, deliveryStatus } = await simulatePost({
            userId: MONITORED_USER_ID,
            text: `forged post ${randomUUID()}`,
            corruptSignature: true
        });

        expect(deliveryStatus).toBe(401);

        const decision = await waitForDecision(postId);
        expect(decision.decision).toBe("DESCARTADO");
        expect(decision.reason).toBe("invalid_signature");
    });
});
