-- Refreshed incrementally by the market cache from GET /markets. Callers
-- resolve kalshi_series_id via upsert_kalshi_series first.
CREATE FUNCTION upsert_kalshi_market(
    p_ticker text,
    p_kalshi_series_id uuid,
    p_event_ticker text,
    p_title text,
    p_yes_sub_title text,
    p_status text,
    p_close_time timestamptz,
    p_rules_primary text,
    p_rules_secondary text,
    p_volume_24h NUMERIC,
    p_open_interest NUMERIC,
    p_source_updated_at timestamptz
)
RETURNS TABLE (id uuid, ticker text)
LANGUAGE sql
AS $$
    INSERT INTO kalshi_markets
        (
            ticker,
            kalshi_series_id,
            event_ticker,
            title,
            yes_sub_title,
            status,
            close_time,
            rules_primary,
            rules_secondary,
            volume_24h,
            open_interest,
            source_updated_at
        )
    VALUES
        (
            p_ticker,
            p_kalshi_series_id,
            p_event_ticker,
            p_title,
            p_yes_sub_title,
            p_status,
            p_close_time,
            p_rules_primary,
            p_rules_secondary,
            p_volume_24h,
            p_open_interest,
            p_source_updated_at
        )
    ON CONFLICT (ticker) DO UPDATE
        SET
            kalshi_series_id = EXCLUDED.kalshi_series_id,
            event_ticker = EXCLUDED.event_ticker,
            title = EXCLUDED.title,
            yes_sub_title = EXCLUDED.yes_sub_title,
            status = EXCLUDED.status,
            close_time = EXCLUDED.close_time,
            rules_primary = EXCLUDED.rules_primary,
            rules_secondary = EXCLUDED.rules_secondary,
            volume_24h = EXCLUDED.volume_24h,
            open_interest = EXCLUDED.open_interest,
            source_updated_at = EXCLUDED.source_updated_at,
            updated_at = now()
    RETURNING id, ticker;
$$;
