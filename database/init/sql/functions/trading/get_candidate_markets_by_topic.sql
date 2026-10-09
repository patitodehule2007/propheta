-- Gate 2 (candidate assembly): topic -> tags -> series -> open markets, from
-- the cache only, never a live Kalshi call on this path. Ranked by 24h volume
-- so the caller can cap to the top N.
CREATE FUNCTION get_candidate_markets_by_topic(
    p_topic text,
    p_max_close_time timestamptz,
    p_min_series_volume NUMERIC,
    p_limit INT
)
RETURNS TABLE (
    ticker text,
    series_ticker text,
    title text,
    yes_sub_title text,
    close_time timestamptz,
    rules_primary text,
    rules_secondary text,
    volume_24h NUMERIC,
    open_interest NUMERIC,
    fee_type text,
    fee_multiplier NUMERIC,
    additional_prohibitions jsonb
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        m.ticker,
        s.series_ticker,
        m.title,
        m.yes_sub_title,
        m.close_time,
        m.rules_primary,
        m.rules_secondary,
        m.volume_24h,
        m.open_interest,
        s.fee_type,
        s.fee_multiplier,
        s.additional_prohibitions
    FROM
        kalshi_markets AS m
        JOIN kalshi_series AS s ON s.id = m.kalshi_series_id
        JOIN topic_market_map AS t ON t.topic = p_topic AND t.is_active = TRUE
    WHERE
        m.status = 'open'
        AND m.close_time <= p_max_close_time
        AND s.volume >= p_min_series_volume
        AND s.tags ?| ARRAY(SELECT jsonb_array_elements_text(t.kalshi_tags))
        ORDER BY m.volume_24h DESC
        LIMIT p_limit;
$$;
