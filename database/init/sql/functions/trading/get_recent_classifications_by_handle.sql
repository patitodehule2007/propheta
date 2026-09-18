-- Backs both the pre-gate's novelty heuristic (same author, same topic,
-- within a window) and the get_author_recent_posts tool. Reads decision_log
-- directly: classifications are not persisted in a table of their own.
CREATE FUNCTION get_recent_classifications_by_handle(p_handle text, p_topic text, p_since timestamptz, p_limit INT)
RETURNS TABLE (
    platform_post_id text,
    raw_text text,
    topic text,
    direction text,
    confidence NUMERIC,
    created_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        d.platform_post_id,
        p.raw_text,
        d.metadata ->> 'topic' AS topic,
        d.metadata ->> 'direction' AS direction,
        (d.metadata ->> 'confidence')::NUMERIC AS confidence,
        d.created_at
    FROM
        decision_log AS d
        JOIN ingested_posts AS p ON p.id = d.ingested_post_id
        JOIN monitored_accounts AS a ON a.id = p.monitored_account_id
    WHERE
        a.handle = p_handle
        AND d.stage = 'AGENT_ANALYSIS'
        AND d.decision = 'CLASSIFIED'
        AND d.created_at >= p_since
        AND (p_topic IS NULL OR d.metadata ->> 'topic' = p_topic)
    ORDER BY d.created_at DESC
    LIMIT p_limit;
$$;
