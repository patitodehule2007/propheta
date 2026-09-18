-- Orders-per-minute loop guard (gate 4's order_rate_limit check).
CREATE FUNCTION count_recent_orders(p_since timestamptz)
RETURNS TABLE (order_count BIGINT)
LANGUAGE sql
STABLE
AS $$
    SELECT count(*)::BIGINT
    FROM orders
    WHERE created_at >= p_since;
$$;
