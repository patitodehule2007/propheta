-- Deadline-sweep read only: returns rows past their deadline, decides
-- nothing. Precedence against stop/take-profit/market-close and the P&L
-- arithmetic all live in the backend's exit supervisor.
CREATE FUNCTION get_positions_due_for_exit(p_now timestamptz)
RETURNS TABLE (
    id uuid,
    ticker text,
    outcome_side text,
    contracts INT,
    entry_fill_cents INT,
    entry_fee_cents INT,
    deadline_at timestamptz,
    is_dry_run BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
    SELECT id, ticker, outcome_side, contracts, entry_fill_cents, entry_fee_cents, deadline_at, is_dry_run
    FROM positions
    WHERE closed_at IS NULL AND deadline_at <= p_now
    ORDER BY deadline_at;
$$;
