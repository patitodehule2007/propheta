-- Written in the same transaction as the order, before anything goes over the
-- wire in a non-dry-run call -- a position never exists without a full exit
-- policy (deadline_at, target_price_cents; stop_price_cents may be null when
-- the ATR stop cannot bind on a valid contract price).
CREATE FUNCTION insert_position(
    p_order_id uuid,
    p_trade_proposal_id uuid,
    p_topic text,
    p_ticker text,
    p_outcome_side text,
    p_contracts INT,
    p_entry_fill_cents INT,
    p_entry_fee_cents INT,
    p_deadline_at timestamptz,
    p_stop_price_cents INT,
    p_target_price_cents INT,
    p_horizon_source text,
    p_horizon_model_minutes INT,
    p_horizon_deterministic_minutes INT,
    p_atr_cents INT,
    p_opened_at timestamptz,
    p_is_dry_run BOOLEAN
)
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
    horizon_source text,
    opened_at timestamptz,
    is_dry_run BOOLEAN
)
LANGUAGE sql
AS $$
    INSERT INTO positions
        (
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
            horizon_source,
            horizon_model_minutes,
            horizon_deterministic_minutes,
            atr_cents,
            opened_at,
            is_dry_run
        )
    VALUES
        (
            p_order_id,
            p_trade_proposal_id,
            p_topic,
            p_ticker,
            p_outcome_side,
            p_contracts,
            p_entry_fill_cents,
            p_entry_fee_cents,
            p_deadline_at,
            p_stop_price_cents,
            p_target_price_cents,
            p_horizon_source,
            p_horizon_model_minutes,
            p_horizon_deterministic_minutes,
            p_atr_cents,
            p_opened_at,
            p_is_dry_run
        )
    RETURNING
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
        horizon_source,
        opened_at,
        is_dry_run;
$$;
