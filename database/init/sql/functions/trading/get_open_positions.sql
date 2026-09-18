-- Every position not yet closed. Read by the exit supervisor on startup to
-- rebuild its in-memory deadline sorted set and ticker watch list.
CREATE FUNCTION get_open_positions()
RETURNS TABLE (
    id uuid,
    order_id uuid,
    trade_proposal_id uuid,
    topic text,
    ticker text,
    outcome_side text,
    contracts INT,
    entry_fill_cents INT,
    entry_fee_cents INT,
    deadline_at timestamptz,
    stop_price_cents INT,
    target_price_cents INT,
    peak_favourable_cents INT,
    opened_at timestamptz,
    is_dry_run BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        id,
        order_id,
        trade_proposal_id,
        topic,
        ticker,
        outcome_side,
        contracts,
        entry_fill_cents,
        entry_fee_cents,
        deadline_at,
        stop_price_cents,
        target_price_cents,
        peak_favourable_cents,
        opened_at,
        is_dry_run
    FROM positions
    WHERE closed_at IS NULL
    ORDER BY deadline_at;
$$;
