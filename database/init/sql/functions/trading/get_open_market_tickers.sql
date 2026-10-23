-- Every currently cached open market ticker in a whitelisted series, ranked by
-- liquidity. The quote poller's watch list -- it never asks Kalshi which
-- markets exist, only the cache this module already refreshes. Series dropped
-- from the whitelist stay cached but are no longer refreshed, so they are
-- excluded here rather than polled on stale status.
CREATE FUNCTION get_open_market_tickers(p_status text, p_min_close_time timestamptz, p_limit INT)
RETURNS TABLE (ticker text)
LANGUAGE sql
STABLE
AS $$
    SELECT m.ticker
    FROM
        kalshi_markets AS m
        JOIN kalshi_series AS s ON s.id = m.kalshi_series_id
    WHERE
        m.status = p_status
        AND m.close_time > p_min_close_time
        AND EXISTS (
            SELECT 1
            FROM
                topic_market_series AS ts
                JOIN topic_market_map AS t ON t.id = ts.topic_market_map_id
            WHERE ts.series_ticker = s.series_ticker AND t.is_active = TRUE
        )
    ORDER BY m.volume_24h DESC
    LIMIT p_limit;
$$;
