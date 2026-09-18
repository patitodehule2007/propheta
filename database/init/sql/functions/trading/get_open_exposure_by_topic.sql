-- Sum of entry cost across every position still open in a topic, cents. Read
-- by gate 4's exposure_cap_topic check.
CREATE FUNCTION get_open_exposure_by_topic(p_topic text)
RETURNS TABLE (topic text, exposure_cents BIGINT)
LANGUAGE sql
STABLE
AS $$
    SELECT p_topic, COALESCE(SUM(entry_fill_cents * contracts), 0)::BIGINT
    FROM positions
    WHERE topic = p_topic AND closed_at IS NULL;
$$;
