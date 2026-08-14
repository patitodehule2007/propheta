import { loginAsAdmin } from "../helpers/auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend-test:5000";

// Fixtured in mocks/x-api-mock/src/state.ts, NOT seeded in
// database/init/sql/seed/ingestion_accounts.sql, so it is free to be
// created by these tests without colliding with the pre-seeded set.
const NEW_HANDLE = "PressSec";
// Already seeded in database/init/sql/seed/ingestion_accounts.sql.
const ALREADY_MONITORED_HANDLE = "realDonaldTrump";

interface Account {
    id: string;
    platformUserId: string;
    handle: string;
    isActive: boolean;
}

describe("Accounts", () => {
    let cookie: string;

    beforeAll(async () => {
        cookie = await loginAsAdmin();
    });

    it("should return a paginated list of monitored accounts", async () => {
        const response = await fetch(`${BACKEND_URL}/api/accounts?limit=2&offset=0`, {
            headers: { Cookie: cookie }
        });
        const body = (await response.json()) as { data: { items: Account[]; totalCount: number; limit: number } };

        expect(response.status).toBe(200);
        expect(body.data.items.length).toBeLessThanOrEqual(2);
        expect(body.data.totalCount).toBeGreaterThanOrEqual(3); // the seeded fixtures
    });

    it("should add a new monitored account by handle", async () => {
        const response = await fetch(`${BACKEND_URL}/api/accounts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookie },
            body: JSON.stringify({ handle: NEW_HANDLE })
        });
        const body = (await response.json()) as { data: Account };

        expect(response.status).toBe(201);
        expect(body.data.handle).toBe(NEW_HANDLE);
        expect(body.data.isActive).toBe(true);

        const deleteResponse = await fetch(`${BACKEND_URL}/api/accounts/${body.data.id}`, {
            method: "DELETE",
            headers: { Cookie: cookie }
        });
        expect(deleteResponse.status).toBe(200);
    });

    it("should return 409 when the handle is already monitored", async () => {
        const response = await fetch(`${BACKEND_URL}/api/accounts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookie },
            body: JSON.stringify({ handle: ALREADY_MONITORED_HANDLE })
        });

        expect(response.status).toBe(409);
    });

    it("should deactivate an account on delete", async () => {
        const createResponse = await fetch(`${BACKEND_URL}/api/accounts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookie },
            body: JSON.stringify({ handle: "SecondSpokesperson" })
        });
        const created = (await createResponse.json()) as { data: Account };

        const deleteResponse = await fetch(`${BACKEND_URL}/api/accounts/${created.data.id}`, {
            method: "DELETE",
            headers: { Cookie: cookie }
        });
        const deleted = (await deleteResponse.json()) as { data: Account };

        expect(deleteResponse.status).toBe(200);
        expect(deleted.data.isActive).toBe(false);
    });

    it("should return 401 when no session cookie is sent", async () => {
        const response = await fetch(`${BACKEND_URL}/api/accounts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handle: NEW_HANDLE })
        });

        expect(response.status).toBe(401);
    });
});
