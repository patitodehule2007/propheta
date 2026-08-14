CREATE FUNCTION list_monitored_accounts(p_limit INT, p_offset INT)
RETURNS TABLE (
    id uuid,
    platform_user_id text,
    handle text,
    is_active BOOLEAN,
    created_at timestamptz,
    total_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        id,
        platform_user_id,
        handle,
        is_active,
        created_at,
        count(*) OVER () AS total_count
    FROM monitored_accounts
    ORDER BY created_at DESC, id DESC
    LIMIT p_limit OFFSET p_offset;
$$;
