-- Backs the get_market_rules tool: rules_primary is the contract, the title
-- is only a summary.
CREATE FUNCTION get_kalshi_market_by_ticker(p_ticker text)
RETURNS TABLE (
    ticker text,
    series_ticker text,
    title text,
    yes_sub_title text,
    status text,
    close_time timestamptz,
    rules_primary text,
    rules_secondary text,
    additional_prohibitions jsonb,
    fee_type text,
    fee_multiplier NUMERIC
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        m.ticker,
        s.series_ticker,
        m.title,
        m.yes_sub_title,
        m.status,
        m.close_time,
        m.rules_primary,
        m.rules_secondary,
        s.additional_prohibitions,
        s.fee_type,
        s.fee_multiplier
    FROM
        kalshi_markets AS m
        JOIN kalshi_series AS s ON s.id = m.kalshi_series_id
    WHERE m.ticker = p_ticker;
$$;
