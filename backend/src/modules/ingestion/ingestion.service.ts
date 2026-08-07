import { config } from "../../config";
import { AuthenticationError } from "../../shared/core/errors";
import { logger } from "../../shared/services/logger";
import {
    getMonitoredAccountByPlatformUserId,
    insertDecisionLog,
    insertIngestedPost
} from "../../repositories/postgres/ingestion.repository";
import { computeCrcResponseToken, verifyWebhookSignature } from "./signatureVerification.service";
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
            stage: "TWEET_RECIBIDO",
            decision: "DESCARTADO",
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
            stage: "TWEET_RECIBIDO",
            decision: "DESCARTADO",
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
            stage: "TWEET_RECIBIDO",
            decision: "DESCARTADO",
            reason: "duplicate_post",
            metadata: null
        });
        return;
    }

    await insertDecisionLog({
        ingestedPostId: ingestedPost.id,
        platformPostId,
        stage: "TWEET_RECIBIDO",
        decision: "INGESTED",
        reason: null,
        metadata: { handle: account.handle, dryRun: config.dryRun }
    });
}
