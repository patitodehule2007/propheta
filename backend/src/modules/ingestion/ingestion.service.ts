import { config } from "../../config";
import { AuthenticationError } from "../../shared/core/errors";
import { logger } from "../../shared/services/logger";
import {
    getMonitoredAccountByPlatformUserId,
    insertDecisionLog,
    insertIngestedPost
} from "../../repositories/postgres/ingestion.repository";
import { computeCrcResponseToken, verifyWebhookSignature } from "./signatureVerification.service";
import { createXWebhook, listXWebhooks } from "./xApiClient.service";
import { PostCreateEvent } from "./xWebhook.schema";

/**
 * Builds the CRC challenge response body X polls for on webhook registration.
 *
 * @param crcToken The `crc_token` query parameter from the challenge GET.
 */
export function handleCrcChallenge(crcToken: string): { response_token: string } {
    return { response_token: computeCrcResponseToken(crcToken, config.xApi.webhookConsumerSecret) };
}

/**
 * Processes one incoming `post.create` webhook delivery end to end:
 * verify signature, resolve the monitored account, persist the post, and
 * always write an audit trail row (stage TWEET_RECIBIDO), operate or not.
 *
 * @param rawBody Exact request body bytes, required for signature verification.
 * @param signatureHeader Value of the `x-twitter-webhooks-signature` header.
 * @param event Parsed and schema-validated event payload.
 * @throws {AuthenticationError} When the signature is missing or invalid.
 */
export async function receiveEvent(
    rawBody: string | Buffer,
    signatureHeader: string | undefined,
    event: PostCreateEvent
): Promise<void> {
    const platformPostId = event.data.id;

    if (!verifyWebhookSignature(rawBody, config.xApi.webhookConsumerSecret, signatureHeader)) {
        await insertDecisionLog({
            ingestedPostId: null,
            platformPostId,
            stage: "TWEET_RECIVED",
            decision: "DISCARDED",
            reason: "invalid_signature",
            metadata: null
        });
        logger.warn({ platformPostId }, "Webhook signature verification failed");
        throw new AuthenticationError("Invalid webhook signature");
    }

    const account = await getMonitoredAccountByPlatformUserId(event.data.author_id);
    if (!account) {
        await insertDecisionLog({
            ingestedPostId: null,
            platformPostId,
            stage: "TWEET_RECIVED",
            decision: "DISCARDED",
            reason: "author_not_monitored",
            metadata: { authorId: event.data.author_id }
        });
        return;
    }

    const ingestedPost = await insertIngestedPost({
        monitoredAccountId: account.id,
        platformPostId,
        rawText: event.data.text,
        receivedAt: event.data.created_at
    });

    if (!ingestedPost) {
        await insertDecisionLog({
            ingestedPostId: null,
            platformPostId,
            stage: "TWEET_RECIVED",
            decision: "DISCARDED",
            reason: "duplicate_post",
            metadata: null
        });
        return;
    }

    await insertDecisionLog({
        ingestedPostId: ingestedPost.id,
        platformPostId,
        stage: "TWEET_RECIVED",
        decision: "INGESTED",
        reason: null,
        metadata: { handle: account.handle, dryRun: config.dryRun }
    });
}

/**
 * Ensures a webhook pointing at `config.xApi.targetUrl` is registered with
 * X, creating it if none exists yet. Idempotent: safe to call on every
 * deploy/startup.
 */
export async function ensureWebhookRegistered(): Promise<{ id: string; url: string; created: boolean }> {
    const webhooks = await listXWebhooks();
    const existing = webhooks.find((webhook) => webhook.url === config.xApi.targetUrl);

    if (existing) {
        logger.info({ webhookId: existing.id, url: existing.url }, "X webhook already registered");
        return { id: existing.id, url: existing.url, created: false };
    }

    const created = await createXWebhook(config.xApi.targetUrl);
    logger.info({ webhookId: created.id, url: created.url }, "X webhook registered");
    return { id: created.id, url: created.url, created: true };
}
