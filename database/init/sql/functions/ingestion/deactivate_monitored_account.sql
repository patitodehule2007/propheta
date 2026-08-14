-- Soft delete: keeps FK integrity with ingested_posts and decision_log.
-- Returns zero rows when the id does not exist; the backend maps that to 404.
CREATE FUNCTION deactivate_monitored_account(p_id uuid)
RETURNS TABLE (id uuid, platform_user_id text, handle text, is_active BOOLEAN, created_at timestamptz)
LANGUAGE sql
AS $$
    UPDATE monitored_accounts
    SET
        is_active = FALSE,
        updated_at = now()
    WHERE id = p_id
    RETURNING id, platform_user_id, handle, is_active, created_at;
$$;
