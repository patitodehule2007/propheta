-- Atomic insert, mirroring insert_ingested_post's dedup pattern: a repeated
-- client_order_id (a retried call after a network timeout) returns zero rows
-- rather than raising, and the backend treats that as idempotent success.
CREATE FUNCTION insert_order(
    p_trade_proposal_id uuid,
    p_client_order_id text,
    p_kalshi_order_id text,
    p_ticker text,
    p_outcome_side text,
    p_limit_price_cents INT,
    p_contracts INT,
    p_status text,
    p_is_dry_run BOOLEAN,
    p_ts_ms BIGINT
)
RETURNS TABLE (
    id uuid,
    trade_proposal_id uuid,
    client_order_id text,
    kalshi_order_id text,
    ticker text,
    outcome_side text,
    limit_price_cents INT,
    contracts INT,
    status text,
    is_dry_run BOOLEAN,
    ts_ms BIGINT,
    created_at timestamptz
)
LANGUAGE sql
AS $$
    INSERT INTO orders
        (
            trade_proposal_id,
            client_order_id,
            kalshi_order_id,
            ticker,
            outcome_side,
            limit_price_cents,
            contracts,
            status,
            is_dry_run,
            ts_ms
        )
    VALUES
        (
            p_trade_proposal_id,
            p_client_order_id,
            p_kalshi_order_id,
            p_ticker,
            p_outcome_side,
            p_limit_price_cents,
            p_contracts,
            p_status,
            p_is_dry_run,
            p_ts_ms
        )
    ON CONFLICT (client_order_id) DO NOTHING
    RETURNING
        id,
        trade_proposal_id,
        client_order_id,
        kalshi_order_id,
        ticker,
        outcome_side,
        limit_price_cents,
        contracts,
        status,
        is_dry_run,
        ts_ms,
        created_at;
$$;
