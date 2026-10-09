-- Backs the find_markets tool escape hatch: every candidate failed on its
-- rules, so widen the search inside the cache. Not a general browser -- still
-- scoped by tag/series/text and capped by p_limit.
CREATE FUNCTION search_kalshi_markets(p_tags jsonb, p_series_ticker text, p_query text, p_limit INT)
RETURNS TABLE (
    ticker text,
    series_ticker text,
    title text,
    yes_sub_title text,
    close_time timestamptz,
    volume_24h NUMERIC
)
LANGUAGE sql
STABLE
AS $$
    SELECT m.ticker, s.series_ticker, m.title, m.yes_sub_title, m.close_time, m.volume_24h
    FROM
        kalshi_markets AS m
        JOIN kalshi_series AS s ON s.id = m.kalshi_series_id
    WHERE
        m.status = 'open'
        AND (p_series_ticker IS NULL OR s.series_ticker = p_series_ticker)
        AND (p_tags IS NULL OR s.tags ?| ARRAY(SELECT jsonb_array_elements_text(p_tags)))
        AND (p_query IS NULL OR m.title ILIKE '%' || p_query || '%' OR m.yes_sub_title ILIKE '%' || p_query || '%')
    ORDER BY m.volume_24h DESC
    LIMIT p_limit;
$$;
