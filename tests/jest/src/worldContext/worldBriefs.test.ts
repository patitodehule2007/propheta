import { randomUUID } from "crypto";

import { loginAsAdmin } from "../helpers/auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend-test:5000";
const MS_PER_HOUR = 3_600_000;
// Mirrors WORLD_BRIEF_MAX_CHARS in docker-compose.jest.yml.
const WORLD_BRIEF_MAX_CHARS = 3000;

// One topic per test, so tests that read "the latest version" never race
// each other. NONE is the one value the taxonomy has that cannot carry a brief.
const BriefTopic = {
    STORE: "TARIFFS_TRADE",
    NEWEST: "IMMIGRATION",
    HISTORY: "APPOINTMENTS_PERSONNEL",
    GENERATE: "SHUTDOWN_BUDGET",
    NOT_BRIEFABLE: "NONE"
} as const;

interface WorldBrief {
    id: string;
    topic: string;
    body: string;
    source: string;
    asOf: string;
    sourceUrls: string[];
}

interface BriefPayload {
    body: string;
    asOf?: string;
    sourceUrls?: string[];
}

/** A unique, valid brief payload; `hoursAgo` dates it relative to now. */
function buildBriefPayload(overrides: Partial<BriefPayload> & { hoursAgo?: number } = {}): BriefPayload {
    const { hoursAgo, ...rest } = overrides;
    return {
        body: `Integration test brief ${randomUUID()}: talks are ongoing and no deadline is set.`,
        asOf: hoursAgo === undefined ? undefined : new Date(Date.now() - hoursAgo * MS_PER_HOUR).toISOString(),
        ...rest
    };
}

async function putBrief(cookie: string, topic: string, payload: BriefPayload): Promise<Response> {
    return fetch(`${BACKEND_URL}/api/world-briefs/${topic}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(payload)
    });
}

describe("World briefs", () => {
    let cookie: string;

    beforeAll(async () => {
        cookie = await loginAsAdmin();
    });

    it("should store a manual brief when the payload is valid", async () => {
        const payload = buildBriefPayload({ hoursAgo: 1, sourceUrls: ["https://example.com/report"] });

        const response = await putBrief(cookie, BriefTopic.STORE, payload);
        const body = (await response.json()) as { data: WorldBrief };

        expect(response.status).toBe(201);
        expect(body.data.topic).toBe(BriefTopic.STORE);
        expect(body.data.body).toBe(payload.body);
        expect(body.data.source).toBe("MANUAL");
        expect(body.data.sourceUrls).toEqual(payload.sourceUrls);
        expect(new Date(body.data.asOf).toISOString()).toBe(payload.asOf);
    });

    it("should return the newest version per topic when several exist", async () => {
        const older = buildBriefPayload({ hoursAgo: 2 });
        const newer = buildBriefPayload({ hoursAgo: 1 });
        expect((await putBrief(cookie, BriefTopic.NEWEST, older)).status).toBe(201);
        expect((await putBrief(cookie, BriefTopic.NEWEST, newer)).status).toBe(201);

        const response = await fetch(`${BACKEND_URL}/api/world-briefs`, { headers: { Cookie: cookie } });
        const body = (await response.json()) as { data: { items: WorldBrief[] } };

        expect(response.status).toBe(200);
        const topicBriefs = body.data.items.filter((item) => item.topic === BriefTopic.NEWEST);
        expect(topicBriefs).toHaveLength(1);
        expect(topicBriefs[0]?.body).toBe(newer.body);
    });

    it("should paginate history when limit and offset are given", async () => {
        const older = buildBriefPayload({ hoursAgo: 2 });
        const newer = buildBriefPayload({ hoursAgo: 1 });
        expect((await putBrief(cookie, BriefTopic.HISTORY, older)).status).toBe(201);
        expect((await putBrief(cookie, BriefTopic.HISTORY, newer)).status).toBe(201);

        const firstPage = await fetch(
            `${BACKEND_URL}/api/world-briefs/${BriefTopic.HISTORY}/history?limit=1&offset=0`,
            {
                headers: { Cookie: cookie }
            }
        );
        const secondPage = await fetch(
            `${BACKEND_URL}/api/world-briefs/${BriefTopic.HISTORY}/history?limit=1&offset=1`,
            { headers: { Cookie: cookie } }
        );
        const first = (await firstPage.json()) as { data: { items: WorldBrief[]; totalCount: number } };
        const second = (await secondPage.json()) as { data: { items: WorldBrief[]; totalCount: number } };

        expect(firstPage.status).toBe(200);
        expect(first.data.items).toHaveLength(1);
        expect(first.data.items[0]?.body).toBe(newer.body);
        expect(first.data.totalCount).toBeGreaterThanOrEqual(2);
        expect(second.data.items[0]?.body).toBe(older.body);
    });

    it("should return 400 when the topic is not briefable", async () => {
        const response = await putBrief(cookie, BriefTopic.NOT_BRIEFABLE, buildBriefPayload());
        const body = (await response.json()) as { error: { code: string } };

        expect(response.status).toBe(400);
        expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when the body is empty", async () => {
        const response = await putBrief(cookie, BriefTopic.STORE, buildBriefPayload({ body: "   " }));
        expect(response.status).toBe(400);
    });

    it("should return 400 when the body is too long", async () => {
        const response = await putBrief(
            cookie,
            BriefTopic.STORE,
            buildBriefPayload({ body: "x".repeat(WORLD_BRIEF_MAX_CHARS + 1) })
        );
        expect(response.status).toBe(400);
    });

    it("should return 400 when asOf is in the future", async () => {
        const response = await putBrief(cookie, BriefTopic.STORE, buildBriefPayload({ hoursAgo: -1 }));
        expect(response.status).toBe(400);
    });

    it("should return 401 when no session is provided", async () => {
        const response = await fetch(`${BACKEND_URL}/api/world-briefs`);
        expect(response.status).toBe(401);
    });

    it("should store a GENERATED brief when generation succeeds", async () => {
        const response = await fetch(`${BACKEND_URL}/api/world-briefs/${BriefTopic.GENERATE}/generate`, {
            method: "POST",
            headers: { Cookie: cookie }
        });
        const body = (await response.json()) as { data: WorldBrief };

        expect(response.status).toBe(201);
        expect(body.data.topic).toBe(BriefTopic.GENERATE);
        expect(body.data.source).toBe("GENERATED");
        expect(body.data.body).toContain(BriefTopic.GENERATE);
        expect(body.data.sourceUrls.length).toBeGreaterThan(0);
    });
});
