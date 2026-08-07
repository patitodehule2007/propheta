import { Pool, QueryResultRow } from "pg";

import { config } from "../../config";

/**
 * Shared connection pool. search_path puts the SQL-function schema first so
 * calls like `SELECT * FROM get_active_monitored_accounts()` resolve without
 * qualifying the schema on every call site.
 */
export const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user: config.db.user,
    password: config.db.password,
    max: config.db.poolMax,
    options: "-c search_path=propheta_fn,propheta,public"
});

/**
 * Runs a parameterized query against a DB function or procedure.
 *
 * @param text SQL text with `$1`, `$2`, ... placeholders. Never interpolate values.
 * @param params Positional query parameters.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: ReadonlyArray<unknown> = []
): Promise<T[]> {
    const result = await pool.query<T>(text, params as unknown[]);
    return result.rows;
}
