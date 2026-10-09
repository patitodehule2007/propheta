-- Refreshed incrementally by the market cache from GET /series. fee_type and
-- fee_multiplier are read from Kalshi verbatim -- never assumed by any caller.
CREATE FUNCTION upsert_kalshi_series(
    p_series_ticker text,
    p_title text,
    p_category text,
    p_tags jsonb,
    p_volume NUMERIC,
    p_fee_type text,
    p_fee_multiplier NUMERIC,
    p_additional_prohibitions jsonb,
    p_source_updated_at timestamptz
)
RETURNS TABLE (id uuid, series_ticker text)
LANGUAGE sql
AS $$
    INSERT INTO kalshi_series
        (
            series_ticker,
            title,
            category,
            tags,
            volume,
            fee_type,
            fee_multiplier,
            additional_prohibitions,
            source_updated_at
        )
    VALUES
        (
            p_series_ticker,
            p_title,
            p_category,
            p_tags,
            p_volume,
            p_fee_type,
            p_fee_multiplier,
            p_additional_prohibitions,
            p_source_updated_at
        )
    ON CONFLICT (series_ticker) DO UPDATE
        SET
            title = EXCLUDED.title,
            category = EXCLUDED.category,
            tags = EXCLUDED.tags,
            volume = EXCLUDED.volume,
            fee_type = EXCLUDED.fee_type,
            fee_multiplier = EXCLUDED.fee_multiplier,
            additional_prohibitions = EXCLUDED.additional_prohibitions,
            source_updated_at = EXCLUDED.source_updated_at,
            updated_at = now()
    RETURNING id, series_ticker;
$$;
