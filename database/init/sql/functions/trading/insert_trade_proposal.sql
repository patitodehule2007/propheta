-- Persists the selection agent's output (gate 3) before risk validation runs.
-- ticker/outcome_side/fair_probability are NULL when action is NO_TRADE.
CREATE FUNCTION insert_trade_proposal(
    p_ingested_post_id uuid,
    p_topic text,
    p_direction text,
    p_confidence NUMERIC,
    p_action text,
    p_ticker text,
    p_outcome_side text,
    p_fair_probability NUMERIC,
    p_conviction NUMERIC,
    p_horizon_model_minutes INT,
    p_no_trade_reason text,
    p_veto_reason text,
    p_status text,
    p_reasoning text,
    p_candidate_tickers jsonb,
    p_inspected_tickers jsonb,
    p_rejected_candidates jsonb
)
RETURNS TABLE (
    id uuid,
    ingested_post_id uuid,
    topic text,
    direction text,
    confidence NUMERIC,
    action text,
    ticker text,
    outcome_side text,
    fair_probability NUMERIC,
    conviction NUMERIC,
    horizon_model_minutes INT,
    no_trade_reason text,
    veto_reason text,
    status text,
    reasoning text,
    candidate_tickers jsonb,
    inspected_tickers jsonb,
    rejected_candidates jsonb,
    created_at timestamptz
)
LANGUAGE sql
AS $$
    INSERT INTO trade_proposals
        (
            ingested_post_id,
            topic,
            direction,
            confidence,
            action,
            ticker,
            outcome_side,
            fair_probability,
            conviction,
            horizon_model_minutes,
            no_trade_reason,
            veto_reason,
            status,
            reasoning,
            candidate_tickers,
            inspected_tickers,
            rejected_candidates
        )
    VALUES
        (
            p_ingested_post_id,
            p_topic,
            p_direction,
            p_confidence,
            p_action,
            p_ticker,
            p_outcome_side,
            p_fair_probability,
            p_conviction,
            p_horizon_model_minutes,
            p_no_trade_reason,
            p_veto_reason,
            p_status,
            p_reasoning,
            p_candidate_tickers,
            p_inspected_tickers,
            p_rejected_candidates
        )
    RETURNING
        id,
        ingested_post_id,
        topic,
        direction,
        confidence,
        action,
        ticker,
        outcome_side,
        fair_probability,
        conviction,
        horizon_model_minutes,
        no_trade_reason,
        veto_reason,
        status,
        reasoning,
        candidate_tickers,
        inspected_tickers,
        rejected_candidates,
        created_at;
$$;
