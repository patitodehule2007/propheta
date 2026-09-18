CREATE FUNCTION get_topic_market_map()
RETURNS TABLE (topic text, kalshi_tags jsonb, default_horizon_minutes INT)
LANGUAGE sql
STABLE
AS $$
    SELECT topic, kalshi_tags, default_horizon_minutes
    FROM topic_market_map
    WHERE is_active = TRUE
    ORDER BY topic;
$$;
