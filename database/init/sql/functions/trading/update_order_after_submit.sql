-- The exchange assigns kalshi_order_id and ts_ms only in the response to
-- POST /portfolio/events/orders; client_order_id was already persisted before
-- that call went out, so this fills in the rest once it returns.
CREATE FUNCTION update_order_after_submit(p_client_order_id text, p_kalshi_order_id text, p_status text, p_ts_ms BIGINT)
RETURNS TABLE (id uuid, client_order_id text, kalshi_order_id text, status text, ts_ms BIGINT)
LANGUAGE sql
AS $$
    UPDATE orders
    SET
        kalshi_order_id = p_kalshi_order_id,
        status = p_status,
        ts_ms = p_ts_ms,
        updated_at = now()
    WHERE client_order_id = p_client_order_id
    RETURNING id, client_order_id, kalshi_order_id, status, ts_ms;
$$;
