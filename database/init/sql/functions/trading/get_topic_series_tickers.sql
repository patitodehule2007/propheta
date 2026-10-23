-- Every whitelisted series ticker across active topics, deduplicated -- a
-- series can serve several topics. The market cache refresh's work list.
CREATE FUNCTION get_topic_series_tickers()
RETURNS TABLE (series_ticker text)
LANGUAGE sql
STABLE
AS $$
    SELECT DISTINCT ts.series_ticker
    FROM
        topic_market_series AS ts
        JOIN topic_market_map AS t ON t.id = ts.topic_market_map_id
    WHERE t.is_active = TRUE
    ORDER BY ts.series_ticker;
$$;
