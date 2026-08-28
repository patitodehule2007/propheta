import { config } from "../../config";
import {
    Decision,
    DiscardReason,
    MAX_AUDITED_TEXT_LENGTH,
    PipelineStage
} from "../../shared/core/decisionLog.constants";
import { AuthenticationError } from "../../shared/core/errors";
import { DecisionOutcome, DecisionStage } from "../../shared/core/decisionLog.constants";
import { logger } from "../../shared/services/logger";
import {
    createMonitoredAccount,
    getMonitoredAccountByPlatformUserId,
    insertDecisionLog,
    insertIngestedPost,
    IngestedPost,
    MonitoredAccount,
    MonitoredAccountDetail
} from "../../repositories/postgres/ingestion.repository";
import { runPostAnalysis } from "../agent/agent.service";
import { computeCrcResponseToken, verifyWebhookSignature } from "./signatureVerification.service";
import { createXWebhook, getUserByUsername, listXWebhooks } from "./xApiClient.service";
import { PostCreateEvent } from "./xWebhook.schema";

/**
 * Outcome of the TWEET_RECEIVED stage, returned to the orchestrator so it can
 * decide whether the pipeline continues. Ingestion no longer terminates the
 * flow: it reports what it decided and lets the coordinator branch.
 */
export type IngestionResult =
    | { status: typeof Decision.INGESTED; post: IngestedPost; account: MonitoredAccount }
    | { status: typeof Decision.DISCARDED; reason: DiscardReason };

/**
 * Builds the CRC challenge response body X polls for on webhook registration.
 *
 * @param crcToken The `crc_token` query parameter from the challenge GET.
 */
export function handleCrcChallenge(crcToken: string): { response_token: string } {
    return { response_token: computeCrcResponseToken(crcToken, config.xApi.webhookConsumerSecret) };
}

/**
 * Bounds untrusted post text before it is copied into the audit trail.
 *
 * @param text Raw post text from the webhook payload.
 * @returns The text, truncated to MAX_AUDITED_TEXT_LENGTH with an ellipsis.
 */
function truncateForAudit(text: string): string {
    if (text.length <= MAX_AUDITED_TEXT_LENGTH) return text;
    return `${text.slice(0, MAX_AUDITED_TEXT_LENGTH)}…`;
}

/**
 * Writes the DISCARDED audit row for a post the pipeline will not act on.
 *
 * Discarded posts never reach `ingested_posts`, so their `decision_log` row is
 * the only surviving record of the event — the author and the (truncated) text
 * are carried in `metadata` to keep the discard forensically useful.
 *
 * @param event Parsed event payload.
 * @param reason Why the post is being dropped.
 * @param extraMetadata Stage-specific context merged into the metadata column.
 */
async function discard(
    event: PostCreateEvent,
    reason: DiscardReason,
    extraMetadata: Record<string, unknown> = {}
): Promise<IngestionResult> {
    await insertDecisionLog({
        ingestedPostId: null,
        platformPostId: event.data.id,
        stage: PipelineStage.TWEET_RECEIVED,
        decision: Decision.DISCARDED,
        reason,
        metadata: {
            authorId: event.data.author_id,
            text: truncateForAudit(event.data.text),
            ...extraMetadata
        }
    });

    return { status: Decision.DISCARDED, reason };
}

/**
 * Runs the TWEET_RECEIVED stage for one incoming `post.create` delivery:
 * verify the signature, resolve the monitored account, persist the post, and
 * write an audit trail row on every path, acted upon or not.
 *
 * @param rawBody Exact request body bytes, required for signature verification.
 * @param signatureHeader Value of the `x-twitter-webhooks-signature` header.
 * @param event Parsed and schema-validated event payload.
 * @returns The stage outcome for the orchestrator to branch on.
 * @throws {AuthenticationError} When the signature is missing or invalid.
 */
export async function receiveEvent(
    rawBody: string | Buffer,
    signatureHeader: string | undefined,
    event: PostCreateEvent
): Promise<IngestionResult> {
    const platformPostId = event.data.id;

    if (!verifyWebhookSignature(rawBody, config.xApi.webhookConsumerSecret, signatureHeader)) {
        // The payload failed verification, so nothing in it is trustworthy —
        // it is audited as unverified rather than as a genuine X event.
        await discard(event, DiscardReason.INVALID_SIGNATURE, { isPayloadVerified: false });
        logger.warn({ platformPostId }, "Webhook signature verification failed");
        throw new AuthenticationError("Invalid webhook signature");
    }

    const account = await getMonitoredAccountByPlatformUserId(event.data.author_id);
    if (!account) {
        return discard(event, DiscardReason.AUTHOR_NOT_MONITORED);
    }

    const ingestedPost = await insertIngestedPost({
        monitoredAccountId: account.id,
        platformPostId,
        rawText: event.data.text,
        receivedAt: event.data.created_at
    });

    if (!ingestedPost) {
        return discard(event, DiscardReason.DUPLICATE_POST, { handle: account.handle });
    }

    // No metadata: ingested_post_id reaches the text, the author and the handle
    // through ingested_posts -> monitored_accounts, so copying them here would
    // duplicate them across every stage row this post goes on to produce.
    await insertDecisionLog({
        ingestedPostId: ingestedPost.id,
        platformPostId,
        stage: PipelineStage.TWEET_RECEIVED,
        decision: Decision.INGESTED,
        reason: null,
        metadata: null
    });

    return { status: Decision.INGESTED, post: ingestedPost, account };
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

/**
 * Resolves a handle to its platform user id via the X API and adds it to
 * the set of monitored accounts.
 *
 * @throws {ConflictError} When the resolved platform user id is already monitored.
 */
export async function addMonitoredAccount(handle: string): Promise<MonitoredAccountDetail> {
    const xUser = await getUserByUsername(handle);
    return createMonitoredAccount({ platformUserId: xUser.id, handle: xUser.username });
}
