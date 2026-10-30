-- The live brief for one topic. Feeds the selection agent, which already
-- knows the topic.
CREATE FUNCTION get_latest_world_brief(p_topic text)
RETURNS TABLE (
    id uuid,
    topic text,
    body text,
    source text,
    as_of timestamptz,
    source_urls jsonb,
    created_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
    SELECT id, topic, body, source, as_of, source_urls, created_at
    FROM world_briefs
    WHERE topic = p_topic
    ORDER BY as_of DESC, created_at DESC
    LIMIT 1;
$$;
