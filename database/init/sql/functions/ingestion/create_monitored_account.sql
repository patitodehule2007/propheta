-- A duplicate platform_user_id raises a unique violation the backend maps to 409.
CREATE FUNCTION create_monitored_account(p_platform_user_id text, p_handle text)
RETURNS TABLE (id uuid, platform_user_id text, handle text, is_active BOOLEAN, created_at timestamptz)
LANGUAGE sql
AS $$
    INSERT INTO monitored_accounts (platform_user_id, handle)
    VALUES (p_platform_user_id, p_handle)
    RETURNING id, platform_user_id, handle, is_active, created_at;
$$;
