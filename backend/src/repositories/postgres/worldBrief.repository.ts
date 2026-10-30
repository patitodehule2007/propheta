import { query } from "../../shared/services/db";

export interface WorldBrief {
    id: string;
    topic: string;
    body: string;
    source: string;
    asOf: string;
    sourceUrls: string[];
    createdAt: string;
}

interface WorldBriefRow {
    id: string;
    topic: string;
    body: string;
    source: string;
    as_of: string;
    source_urls: string[];
    created_at: string;
}

const WORLD_BRIEF_COLUMNS = "id, topic, body, source, as_of, source_urls, created_at";

function toWorldBrief(row: WorldBriefRow): WorldBrief {
    return {
        id: row.id,
        topic: row.topic,
        body: row.body,
        source: row.source,
        asOf: row.as_of,
        sourceUrls: row.source_urls,
        createdAt: row.created_at
    };
}

/**
 * Appends one brief version; the newest version per topic is the live brief.
 * @returns the stored version
 */
export async function insertWorldBrief(params: {
    topic: string;
    body: string;
    source: string;
    asOf: string;
    sourceUrls: string[];
}): Promise<WorldBrief> {
    const rows = await query<WorldBriefRow>(
        `SELECT ${WORLD_BRIEF_COLUMNS} FROM insert_world_brief($1, $2, $3, $4, $5)`,
        [params.topic, params.body, params.source, params.asOf, JSON.stringify(params.sourceUrls)]
    );
    const row = rows[0];
    if (!row) {
        throw new Error("insert_world_brief returned no row");
    }
    return toWorldBrief(row);
}

/**
 * Reads the live brief of every active topic that has one. Bounded by the
 * topic taxonomy, so it needs no pagination.
 */
export async function getLatestWorldBriefs(): Promise<WorldBrief[]> {
    const rows = await query<WorldBriefRow>(`SELECT ${WORLD_BRIEF_COLUMNS} FROM get_latest_world_briefs()`);
    return rows.map(toWorldBrief);
}

/**
 * Reads the live brief for one topic.
 * @returns the brief, or null when the topic has none
 */
export async function getLatestWorldBrief(topic: string): Promise<WorldBrief | null> {
    const rows = await query<WorldBriefRow>(`SELECT ${WORLD_BRIEF_COLUMNS} FROM get_latest_world_brief($1)`, [topic]);
    const row = rows[0];
    return row ? toWorldBrief(row) : null;
}

/**
 * Paginated version history for one topic, newest first.
 */
export async function listWorldBriefs(params: {
    topic: string;
    limit: number;
    offset: number;
}): Promise<{ items: WorldBrief[]; totalCount: number }> {
    const rows = await query<WorldBriefRow & { total_count: string }>(
        `SELECT ${WORLD_BRIEF_COLUMNS}, total_count FROM list_world_briefs($1, $2, $3)`,
        [params.topic, params.limit, params.offset]
    );
    const totalCount = rows[0] ? Number(rows[0].total_count) : 0;
    return { items: rows.map(toWorldBrief), totalCount };
}
