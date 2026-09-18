-- Guarded by closed_at IS NULL so two concurrent exit triggers on the same
-- position race safely: the loser's UPDATE matches zero rows and the backend
-- treats an empty result as "already closed", not an error.
CREATE FUNCTION close_position(
    p_position_id uuid,
    p_closed_at timestamptz,
    p_exit_reason text,
    p_exit_price_cents INT,
    p_realized_pnl_cents INT
)
RETURNS TABLE (id uuid, closed_at timestamptz, exit_reason text, exit_price_cents INT, realized_pnl_cents INT)
LANGUAGE sql
AS $$
    UPDATE positions
    SET
        closed_at = p_closed_at,
        exit_reason = p_exit_reason,
        exit_price_cents = p_exit_price_cents,
        realized_pnl_cents = p_realized_pnl_cents,
        updated_at = now()
    WHERE id = p_position_id AND closed_at IS NULL
    RETURNING id, closed_at, exit_reason, exit_price_cents, realized_pnl_cents;
$$;
