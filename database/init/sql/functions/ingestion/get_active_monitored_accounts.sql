CREATE FUNCTION get_active_monitored_accounts()
RETURNS TABLE (id uuid, platform_user_id text, handle text)
LANGUAGE sql
STABLE
AS $$
    SELECT id, platform_user_id, handle
    FROM monitored_accounts
    WHERE is_active = TRUE
    ORDER BY handle;
$$;
