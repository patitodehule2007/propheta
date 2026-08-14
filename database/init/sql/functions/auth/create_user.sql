-- Only called by the admin bootstrap script (backend/src/shared/scripts/createAdminUser.ts).
-- There is no self-registration endpoint; a duplicate email raises a unique
-- violation the caller is expected to handle.
CREATE FUNCTION create_user(p_email text, p_password_hash text)
RETURNS TABLE (id uuid, email text, created_at timestamptz)
LANGUAGE sql
AS $$
    INSERT INTO users (email, password_hash)
    VALUES (p_email, p_password_hash)
    RETURNING id, email, created_at;
$$;
