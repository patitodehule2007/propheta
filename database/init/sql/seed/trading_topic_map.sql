-- Handwritten topic table (docs/backend/tradeDecision.md open decision 4:
-- human-reviewed, never generated). Which Kalshi series each topic reaches
-- lives in trading_topic_series.sql. NONE has no row -- the pre-gate already
-- discards it before candidate assembly ever runs.

-- max_close_horizon_minutes: how far out a candidate market may close. NULL
-- falls back to the global TRADE_HORIZON_MINUTES. Tariff, appointment and
-- other political markets settle on month-to-year timelines, so 180 days
-- (259200 minutes); Fed decision markets close at each FOMC meeting and keep
-- the global window. Exits are timed by the exit policy regardless.

-- Updated as of 23/10/26
INSERT INTO topic_market_map (topic, default_horizon_minutes, max_close_horizon_minutes)
VALUES
    ('TARIFFS_TRADE', 240, 259200),
    ('APPOINTMENTS_PERSONNEL', 720, 259200),
    ('MONETARY_POLICY_FED', 180, NULL),
    ('INTERNATIONAL_CONFLICT', 60, 259200),
    ('SHUTDOWN_BUDGET', 360, 259200),
    ('CRYPTO_REGULATION', 480, 259200),
    ('IMMIGRATION', 720, 259200)
ON CONFLICT (topic) DO UPDATE
    SET
        default_horizon_minutes = EXCLUDED.default_horizon_minutes,
        max_close_horizon_minutes = EXCLUDED.max_close_horizon_minutes,
        updated_at = NOW();
