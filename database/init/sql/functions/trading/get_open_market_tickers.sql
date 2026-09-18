-- Every currently cached open market ticker, ranked by liquidity. The quote
-- poller's watch list -- it never asks Kalshi which markets exist, only the
-- cache this module already refreshes.
CREATE FUNCTION get_open_market_tickers(p_limit INT)
RETURNS TABLE (ticker text)
LANGUAGE sql
STABLE
AS $$
    SELECT ticker
    FROM kalshi_markets
    WHERE status = 'open'
    ORDER BY volume_24h DESC
    LIMIT p_limit;
$$;
