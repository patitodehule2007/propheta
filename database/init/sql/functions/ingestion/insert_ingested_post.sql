-- Atomic insert. Returns zero rows when platform_post_id already exists
-- (dedup via unique constraint, not exception handling); the backend
-- interprets an empty result as "already seen".
CREATE FUNCTION insert_ingested_post(
    p_monitored_account_id uuid,
    p_platform_post_id text,
    p_raw_text text,
    p_received_at timestamptz
)
RETURNS TABLE (
    id uuid,
    monitored_account_id uuid,
    platform_post_id text,
    raw_text text,
    received_at timestamptz
)
LANGUAGE sql
AS $$
    INSERT INTO ingested_posts (monitored_account_id, platform_post_id, raw_text, received_at)
    VALUES (p_monitored_account_id, p_platform_post_id, p_raw_text, p_received_at)
    ON CONFLICT (platform_post_id) DO NOTHING
    RETURNING id, monitored_account_id, platform_post_id, raw_text, received_at;
$$;
