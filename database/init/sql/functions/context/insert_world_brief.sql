-- Appends one brief version. The latest row per topic is the live brief;
-- nothing is ever updated in place.
CREATE FUNCTION insert_world_brief(p_topic text, p_body text, p_source text, p_as_of timestamptz, p_source_urls jsonb)
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
AS $$
    INSERT INTO world_briefs (topic, body, source, as_of, source_urls)
    VALUES (p_topic, p_body, p_source, p_as_of, p_source_urls)
    RETURNING id, topic, body, source, as_of, source_urls, created_at;
$$;
