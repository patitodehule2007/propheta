-- Every whitelisted series per active topic, with its cached Kalshi title when
-- the market cache has fetched it (NULL until then). The classifier's
-- <tracked_markets> block: which events each topic can actually trade on.
CREATE FUNCTION get_topic_series_catalog()
RETURNS TABLE (topic text, series_ticker text, series_title text)
LANGUAGE sql
STABLE
AS $$
    SELECT t.topic, ts.series_ticker, ks.title AS series_title
    FROM
        topic_market_series AS ts
        JOIN topic_market_map AS t ON t.id = ts.topic_market_map_id
        LEFT JOIN kalshi_series AS ks ON ks.series_ticker = ts.series_ticker
    WHERE t.is_active = TRUE
    ORDER BY t.topic, ts.series_ticker;
$$;
