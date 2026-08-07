import { randomBytes, randomUUID } from "crypto";
import express, { Request, Response } from "express";

import { config } from "./config";
import { signPayload } from "./signature";
import {
    getLastRegisteredWebhookId,
    MockSubscription,
    MockWebhook,
    setLastRegisteredWebhookId,
    subscriptions,
    USERS,
    webhooks
} from "./state";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

// --- Users --------------------------------------------------------------

app.get("/2/users/by/username/:username", (req: Request, res: Response) => {
    const user = USERS[String(req.params.username)];
    if (!user) {
        res.status(404).json({ errors: [{ detail: "User not found" }] });
        return;
    }
    res.status(200).json({ data: user });
});

// --- Webhooks -------------------------------------------------------------

async function performCrcChallenge(webhook: MockWebhook): Promise<boolean> {
    const crcToken = randomBytes(16).toString("hex");
    const expected = signPayload(config.webhookConsumerSecret, crcToken);

    try {
        const url = new URL(webhook.url);
        url.searchParams.set("crc_token", crcToken);
        const response = await fetch(url.toString());
        if (!response.ok) return false;
        const body = (await response.json()) as { response_token?: string };
        return body.response_token === expected;
    } catch {
        return false;
    }
}

app.post("/2/webhooks", async (req: Request, res: Response) => {
    const url = req.body?.url as string | undefined;
    if (!url) {
        res.status(400).json({ errors: [{ detail: "url is required" }] });
        return;
    }

    const webhook: MockWebhook = { id: randomUUID(), url, valid: false, createdAt: new Date().toISOString() };
    webhook.valid = await performCrcChallenge(webhook);
    webhooks.set(webhook.id, webhook);
    setLastRegisteredWebhookId(webhook.id);

    res.status(200).json({ data: webhook });
});

app.get("/2/webhooks", (_req: Request, res: Response) => {
    res.status(200).json({ data: Array.from(webhooks.values()) });
});

app.put("/2/webhooks/:id", async (req: Request, res: Response) => {
    const webhook = webhooks.get(String(req.params.id));
    if (!webhook) {
        res.status(404).json({ errors: [{ detail: "Webhook not found" }] });
        return;
    }
    webhook.valid = await performCrcChallenge(webhook);
    res.status(200).json({ data: webhook });
});

app.delete("/2/webhooks/:id", (req: Request, res: Response) => {
    webhooks.delete(String(req.params.id));
    res.status(200).json({ data: null });
});

// --- Activity subscriptions ----------------------------------------------

app.post("/2/activity/subscriptions", (req: Request, res: Response) => {
    const eventType = req.body?.event_type as string | undefined;
    const userId = req.body?.filter?.user_id as string | undefined;
    const webhookId = req.body?.webhook_id as string | undefined;
    const tag = (req.body?.tag as string | undefined) ?? null;

    if (!eventType || !userId || !webhookId) {
        res.status(400).json({ errors: [{ detail: "event_type, filter.user_id and webhook_id are required" }] });
        return;
    }

    const subscription: MockSubscription = {
        subscriptionId: randomUUID(),
        eventType,
        userId,
        tag,
        webhookId,
        createdAt: new Date().toISOString()
    };
    subscriptions.set(subscription.subscriptionId, subscription);

    res.status(200).json({
        data: {
            subscription_id: subscription.subscriptionId,
            event_type: subscription.eventType,
            filter: { user_id: subscription.userId },
            tag: subscription.tag,
            webhook_id: subscription.webhookId,
            created_at: subscription.createdAt
        },
        meta: { total_subscriptions: subscriptions.size }
    });
});

app.get("/2/activity/subscriptions", (_req: Request, res: Response) => {
    res.status(200).json({ data: Array.from(subscriptions.values()) });
});

app.delete("/2/activity/subscriptions/:id", (req: Request, res: Response) => {
    subscriptions.delete(String(req.params.id));
    res.status(200).json({ data: null });
});

// --- Test-only delivery trigger --------------------------------------------
// Not part of the real X API. Builds a post.create event and delivers it,
// signed, to a registered webhook so integration tests can drive the
// ingestion pipeline end to end without a real X account.

app.post("/mock/simulate-post", async (req: Request, res: Response) => {
    const userId = req.body?.userId as string | undefined;
    const text = req.body?.text as string | undefined;
    const postId = (req.body?.postId as string | undefined) ?? randomUUID();
    const corruptSignature = req.body?.corruptSignature === true;
    const webhookId = (req.body?.webhookId as string | undefined) ?? getLastRegisteredWebhookId();

    if (!userId || !text) {
        res.status(400).json({ errors: [{ detail: "userId and text are required" }] });
        return;
    }
    const webhook = webhookId ? webhooks.get(webhookId) : undefined;
    if (!webhook) {
        res.status(400).json({ errors: [{ detail: "No registered webhook to deliver to" }] });
        return;
    }

    const event = {
        event_type: "post.create",
        data: { id: postId, text, author_id: userId, created_at: new Date().toISOString() }
    };
    const rawBody = JSON.stringify(event);
    const signature = corruptSignature
        ? `sha256=${Buffer.from("invalid").toString("base64")}`
        : signPayload(config.webhookConsumerSecret, rawBody);

    const deliveryResponse = await fetch(webhook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-twitter-webhooks-signature": signature },
        body: rawBody
    });

    res.status(200).json({
        data: {
            postId,
            deliveredTo: webhook.url,
            deliveryStatus: deliveryResponse.status
        }
    });
});

app.listen(config.port, "0.0.0.0", () => {
    console.log(`x-api-mock listening on ${config.port}`);
});
