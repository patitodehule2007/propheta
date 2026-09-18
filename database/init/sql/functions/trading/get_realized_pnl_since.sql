-- Daily-loss kill switch input (gate 1's kill_switch check).
CREATE FUNCTION get_realized_pnl_since(p_since timestamptz)
RETURNS TABLE (realized_pnl_cents BIGINT)
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(realized_pnl_cents), 0)::BIGINT
    FROM positions
    WHERE closed_at >= p_since AND realized_pnl_cents IS NOT NULL;
$$;
