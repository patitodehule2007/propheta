export interface MockUser {
    id: string;
    name: string;
    username: string;
}

export interface MockWebhook {
    id: string;
    url: string;
    valid: boolean;
    createdAt: string;
}

export interface MockSubscription {
    subscriptionId: string;
    eventType: string;
    userId: string;
    tag: string | null;
    webhookId: string;
    createdAt: string;
}

/**
 * Static handle -> user_id fixture map. Must match
 * database/init/sql/seed/ingestion_accounts.sql so the seeded monitored
 * accounts resolve to the same platform_user_id this mock returns.
 *
 * PressSec and SecondSpokesperson are intentionally NOT seeded in
 * ingestion_accounts.sql, so integration tests can exercise adding fresh
 * monitored accounts without colliding with the pre-seeded set (or with
 * each other, across tests that each need an unused handle).
 */
export const USERS: Record<string, MockUser> = {
    realDonaldTrump: { id: "25073877", name: "Donald J. Trump", username: "realDonaldTrump" },
    WhiteHouse: { id: "1349149096909668362", name: "The White House", username: "WhiteHouse" },
    JDVance: { id: "210437201", name: "JD Vance", username: "JDVance" },
    PressSec: { id: "1129032871", name: "Press Secretary", username: "PressSec" },
    SecondSpokesperson: { id: "1129032872", name: "Second Spokesperson", username: "SecondSpokesperson" }
};

export const webhooks = new Map<string, MockWebhook>();
export const subscriptions = new Map<string, MockSubscription>();

let lastRegisteredWebhookId: string | null = null;

export function setLastRegisteredWebhookId(id: string): void {
    lastRegisteredWebhookId = id;
}

export function getLastRegisteredWebhookId(): string | null {
    return lastRegisteredWebhookId;
}
