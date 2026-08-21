import { createHash, randomUUID } from "crypto";
import Redis from "ioredis";
import { registerBackendWebhook, simulatePost, waitForDecision } from "../helpers/xApiMock";

const ANTHROPIC_MOCK_URL = process.env.ANTHROPIC_BASE_URL ?? "http://anthropic-mock-test:4200";
const MONITORED_USER_ID = "25073877"; // realDonaldTrump, seeded in database/init/sql/seed/ingestion_accounts.sql

interface CachedPage {
    markdown: string | null;
    url: string;
}

/** Mirrors backend/src/repositories/redis/scrapedPage.repository.ts's key scheme. */
function cacheKeyFor(url: string): string {
    return "scrape:v1:" + createHash("sha256").update(url).digest("hex");
}

describe("Scrape cache", () => {
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
        await redis.quit();
    });

    it("should cache a successfully scraped page, keyed by its URL", async () => {
        const url = `${ANTHROPIC_MOCK_URL}/fixtures/steel.html`;
        const { postId } = await simulatePost({
            userId: MONITORED_USER_ID,
            text: `Steel industry statement: ${url} (${randomUUID()})`
        });

        await waitForDecision(postId, { stage: "AGENT_ANALYSIS", timeoutMs: 20000 });

        const raw = await redis.get(cacheKeyFor(url));
        expect(raw).not.toBeNull();

        const entry = JSON.parse(raw as string) as CachedPage;
        expect(entry.url).toBe(url);
        expect(entry.markdown).toContain("Steel Industry");
    });

    it("should cache a failed fetch as a negative entry", async () => {
        const url = `${ANTHROPIC_MOCK_URL}/fixtures/does-not-exist-${randomUUID()}.html`;
        const { postId } = await simulatePost({
            userId: MONITORED_USER_ID,
            text: `Broken link post: ${url}`
        });

        await waitForDecision(postId, { stage: "AGENT_ANALYSIS", timeoutMs: 20000 });

        const raw = await redis.get(cacheKeyFor(url));
        expect(raw).not.toBeNull();

        const entry = JSON.parse(raw as string) as CachedPage;
        expect(entry.markdown).toBeNull();
    });
});
