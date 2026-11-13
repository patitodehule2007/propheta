-- Gate 2 (candidate assembly): topic -> whitelisted series -> open markets,
-- from the cache only, never a live Kalshi call on this path. Markets in
-- p_priority_series (the series the classifier says settle on the post's
-- event) rank first, then by 24h volume, so the caller can cap to the top N
-- without a busy unrelated series crowding the relevant one out. p_status and p_min_close_time come from
-- the backend: the cache never re-reads a market once Kalshi stops listing it
-- as open, so a stored status alone cannot tell a live row from a closed one.
CREATE FUNCTION get_candidate_markets_by_topic(
    p_topic text,
    p_status text,
    p_min_close_time timestamptz,
    p_max_close_time timestamptz,
    p_min_series_volume NUMERIC,
    p_priority_series text[],
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
        topic_market_map AS t
        JOIN topic_market_series AS ts ON ts.topic_market_map_id = t.id
        JOIN kalshi_series AS s ON s.series_ticker = ts.series_ticker
        JOIN kalshi_markets AS m ON m.kalshi_series_id = s.id
    WHERE
        t.topic = p_topic
        AND t.is_active = TRUE
        AND m.status = p_status
        AND m.close_time > p_min_close_time
        AND m.close_time <= p_max_close_time
        AND s.volume >= p_min_series_volume
    ORDER BY (s.series_ticker = ANY (p_priority_series)) DESC, m.volume_24h DESC
    LIMIT p_limit;
$$;
