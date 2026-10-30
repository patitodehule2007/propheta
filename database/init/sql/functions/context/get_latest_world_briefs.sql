-- The live brief for every active topic that has one. Feeds the classifier,
-- which runs before the post's topic is known.
CREATE FUNCTION get_latest_world_briefs()
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
    SELECT DISTINCT ON (b.topic)
        b.id,
        b.topic,
        b.body,
        b.source,
        b.as_of,
        b.source_urls,
        b.created_at
    FROM
        world_briefs AS b
        JOIN topic_market_map AS t ON t.topic = b.topic
    WHERE t.is_active = TRUE
    ORDER BY b.topic, b.as_of DESC, b.created_at DESC;
$$;
