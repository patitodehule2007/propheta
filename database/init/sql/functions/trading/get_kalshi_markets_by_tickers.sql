-- Batch fee/status lookup backing the get_market_quote tool; live prices come
-- from the Redis quote cache, not from here.
CREATE FUNCTION get_kalshi_markets_by_tickers(p_tickers text[])
RETURNS TABLE (ticker text, status text, close_time timestamptz, fee_type text, fee_multiplier NUMERIC)
LANGUAGE sql
STABLE
AS $$
    SELECT m.ticker, m.status, m.close_time, s.fee_type, s.fee_multiplier
    FROM
        kalshi_markets AS m
        JOIN kalshi_series AS s ON s.id = m.kalshi_series_id
    WHERE m.ticker = ANY (p_tickers);
$$;
