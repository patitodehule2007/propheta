CREATE FUNCTION list_decision_log(p_platform_post_id text, p_limit INT, p_offset INT)
RETURNS TABLE (
    id uuid,
    ingested_post_id uuid,
    platform_post_id text,
    stage text,
    decision text,
    reason text,
    metadata jsonb,
    created_at timestamptz,
    total_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        id,
        ingested_post_id,
        platform_post_id,
        stage,
        decision,
        reason,
        metadata,
        created_at,
        count(*) OVER () AS total_count
    FROM decision_log
    WHERE p_platform_post_id IS NULL OR platform_post_id = p_platform_post_id
    ORDER BY created_at DESC, id DESC
    LIMIT p_limit OFFSET p_offset;
$$;
