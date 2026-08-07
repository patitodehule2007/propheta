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
 */
export const USERS: Record<string, MockUser> = {
    realDonaldTrump: { id: "25073877", name: "Donald J. Trump", username: "realDonaldTrump" },
    WhiteHouse: { id: "1349149096909668362", name: "The White House", username: "WhiteHouse" },
    JDVance: { id: "210437201", name: "JD Vance", username: "JDVance" }
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
