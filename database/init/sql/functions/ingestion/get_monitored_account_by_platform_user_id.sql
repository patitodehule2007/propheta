CREATE FUNCTION get_monitored_account_by_platform_user_id(p_platform_user_id text)
RETURNS TABLE (id uuid, platform_user_id text, handle text, is_active BOOLEAN)
LANGUAGE sql
STABLE
AS $$
    SELECT id, platform_user_id, handle, is_active
    FROM monitored_accounts
    WHERE platform_user_id = p_platform_user_id;
$$;
