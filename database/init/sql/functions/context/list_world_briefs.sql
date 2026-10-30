-- Version history for one topic, newest first.
CREATE FUNCTION list_world_briefs(p_topic text, p_limit INT, p_offset INT)
RETURNS TABLE (
    id uuid,
    topic text,
    body text,
    source text,
    as_of timestamptz,
    source_urls jsonb,
    created_at timestamptz,
    total_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        id,
        topic,
        body,
        source,
        as_of,
        source_urls,
        created_at,
        count(*) OVER () AS total_count
    FROM world_briefs
    WHERE topic = p_topic
    ORDER BY as_of DESC, created_at DESC
    LIMIT p_limit OFFSET p_offset;
$$;
