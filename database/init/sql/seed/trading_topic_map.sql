-- Handwritten topic -> Kalshi tag mapping (docs/backend/tradeDecision.md
-- open decision 4: human-reviewed, never generated). Tags are matched against
-- docs/projectDefenition/initial_investigation.md §5.3's GET /series?tags=
-- vocabulary. Reconciled against the live GET /search/tags_by_categories
-- response (Kalshi has no tariff/immigration/budget/regulation tags, so those
-- topics use the closest adjacent tags). NONE has no row -- the pre-gate
-- already discards it before candidate assembly ever runs.

-- Updated as of 2/10/26
INSERT INTO topic_market_map (topic, kalshi_tags, default_horizon_minutes)
VALUES
    ('TARIFFS_TRADE', '["Economics", "Inflation", "Trump"]'::jsonb, 240),
    ('APPOINTMENTS_PERSONNEL', '["Politics", "Trump", "Congress"]'::jsonb, 720),
    ('MONETARY_POLICY_FED', '["Economics", "Fed", "Interest Rates"]'::jsonb, 180),
    ('INTERNATIONAL_CONFLICT', '["World", "International", "Iran"]'::jsonb, 60),
    ('SHUTDOWN_BUDGET', '["Politics", "Congress", "Economics"]'::jsonb, 360),
    ('CRYPTO_REGULATION', '["Crypto", "Politics", "Financials"]'::jsonb, 480),
    ('IMMIGRATION', '["Politics", "Trump", "SCOTUS & courts"]'::jsonb, 720)
ON CONFLICT (topic) DO UPDATE
SET kalshi_tags = EXCLUDED.kalshi_tags,
    default_horizon_minutes = EXCLUDED.default_horizon_minutes,
    updated_at = NOW();
