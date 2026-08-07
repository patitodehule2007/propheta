import { query } from "../../shared/services/db";

export interface MonitoredAccount {
    id: string;
    platformUserId: string;
    handle: string;
}

export interface IngestedPost {
    id: string;
    monitoredAccountId: string;
    platformPostId: string;
    rawText: string;
    receivedAt: string;
}

export interface DecisionLogEntry {
    id: string;
    ingestedPostId: string | null;
    platformPostId: string | null;
    stage: string;
    decision: string;
    reason: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
}

interface DecisionLogRow {
    id: string;
    ingested_post_id: string | null;
    platform_post_id: string | null;
    stage: string;
    decision: string;
    reason: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    total_count: string;
}

/**
 * Returns every monitored account currently eligible for ingestion.
 */
export async function getActiveMonitoredAccounts(): Promise<MonitoredAccount[]> {
    const rows = await query<{ id: string; platform_user_id: string; handle: string }>(
        "SELECT * FROM get_active_monitored_accounts()"
    );
    return rows.map((row) => ({ id: row.id, platformUserId: row.platform_user_id, handle: row.handle }));
}

/**
 * Looks up a monitored account by its platform (X) user id.
 *
 * @param platformUserId The `user_id` from the incoming post.create payload.
 */
export async function getMonitoredAccountByPlatformUserId(platformUserId: string): Promise<MonitoredAccount | null> {
    const rows = await query<{ id: string; platform_user_id: string; handle: string; is_active: boolean }>(
        "SELECT * FROM get_monitored_account_by_platform_user_id($1)",
        [platformUserId]
    );
    const row = rows[0];
    if (!row || !row.is_active) return null;
    return { id: row.id, platformUserId: row.platform_user_id, handle: row.handle };
}

/**
 * Inserts an ingested post. Returns null when the post was already seen
 * (unique constraint on platform_post_id), not an error.
 */
export async function insertIngestedPost(params: {
    monitoredAccountId: string;
    platformPostId: string;
    rawText: string;
    receivedAt: string;
}): Promise<IngestedPost | null> {
    const rows = await query<{
        id: string;
        monitored_account_id: string;
        platform_post_id: string;
        raw_text: string;
        received_at: string;
    }>("SELECT * FROM insert_ingested_post($1, $2, $3, $4)", [
        params.monitoredAccountId,
        params.platformPostId,
        params.rawText,
        params.receivedAt
    ]);
    const row = rows[0];
    if (!row) return null;
    return {
        id: row.id,
        monitoredAccountId: row.monitored_account_id,
        platformPostId: row.platform_post_id,
        rawText: row.raw_text,
        receivedAt: row.received_at
    };
}

/**
 * Writes one audit trail entry. Called for every processed post, whether or
 * not the pipeline decided to act on it.
 */
export async function insertDecisionLog(params: {
    ingestedPostId: string | null;
    platformPostId: string | null;
    stage: string;
    decision: string;
    reason: string | null;
    metadata: Record<string, unknown> | null;
}): Promise<DecisionLogEntry> {
    const rows = await query<DecisionLogRow>("SELECT * FROM insert_decision_log($1, $2, $3, $4, $5, $6)", [
        params.ingestedPostId,
        params.platformPostId,
        params.stage,
        params.decision,
        params.reason,
        params.metadata
    ]);
    const row = rows[0];
    if (!row) throw new Error("insert_decision_log returned no row");
    return {
        id: row.id,
        ingestedPostId: row.ingested_post_id,
        platformPostId: row.platform_post_id,
        stage: row.stage,
        decision: row.decision,
        reason: row.reason,
        metadata: row.metadata,
        createdAt: row.created_at
    };
}

/**
 * Paginated audit log read, optionally filtered by platform post id.
 */
export async function listDecisionLog(params: {
    platformPostId: string | null;
    limit: number;
    offset: number;
}): Promise<{ items: DecisionLogEntry[]; totalCount: number }> {
    const rows = await query<DecisionLogRow>("SELECT * FROM list_decision_log($1, $2, $3)", [
        params.platformPostId,
        params.limit,
        params.offset
    ]);
    const items = rows.map((row) => ({
        id: row.id,
        ingestedPostId: row.ingested_post_id,
        platformPostId: row.platform_post_id,
        stage: row.stage,
        decision: row.decision,
        reason: row.reason,
        metadata: row.metadata,
        createdAt: row.created_at
    }));
    const totalCount = rows[0] ? Number(rows[0].total_count) : 0;
    return { items, totalCount };
}

/**
 * Creates or refreshes a monitored account's webhook subscription record.
 */
export async function upsertXWebhookSubscription(params: {
    monitoredAccountId: string;
    eventType: string;
    platformSubscriptionId: string;
    webhookId: string;
}): Promise<void> {
    await query("SELECT * FROM upsert_x_webhook_subscription($1, $2, $3, $4)", [
        params.monitoredAccountId,
        params.eventType,
        params.platformSubscriptionId,
        params.webhookId
    ]);
}
