CREATE FUNCTION get_topic_market_map()
RETURNS TABLE (topic text, default_horizon_minutes INT, max_close_horizon_minutes INT)
LANGUAGE sql
STABLE
AS $$
    SELECT topic, default_horizon_minutes, max_close_horizon_minutes
    FROM topic_market_map
    WHERE is_active = TRUE
    ORDER BY topic;
$$;
