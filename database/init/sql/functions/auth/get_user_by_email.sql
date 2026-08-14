CREATE FUNCTION get_user_by_email(p_email text)
RETURNS TABLE (id uuid, email text, password_hash text, created_at timestamptz)
LANGUAGE sql
STABLE
AS $$
    SELECT id, email, password_hash, created_at
    FROM users
    WHERE email = p_email;
$$;
