-- Sets the recorded high-water mark. The backend computes the greatest of the
-- current value and the new tick before calling -- this function only writes
-- what it is told, per the no-business-logic-in-the-database rule.
CREATE FUNCTION update_position_peak_favourable(p_position_id uuid, p_peak_favourable_cents INT)
RETURNS TABLE (id uuid, peak_favourable_cents INT)
LANGUAGE sql
AS $$
    UPDATE positions
    SET
        peak_favourable_cents = p_peak_favourable_cents,
        updated_at = now()
    WHERE id = p_position_id
    RETURNING id, peak_favourable_cents;
$$;
