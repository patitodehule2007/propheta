-- Hand-written topic -> Kalshi tag mapping (docs/backend/tradeDecision.md
-- open decision 4: human-reviewed, never generated). Tags are matched against
-- docs/projectDefenition/initial_investigation.md §5.3's GET /series?tags=
-- vocabulary; review and adjust against the live GET /search/tags_by_categories
-- response before enabling real trading. NONE has no row -- the pre-gate
-- already discards it before candidate assembly ever runs.
INSERT INTO topic_market_map (topic, kalshi_tags, default_horizon_minutes)
VALUES
    ('TARIFFS_TRADE', '["Trade", "Tariffs", "Economics"]'::jsonb, 240),
    ('APPOINTMENTS_PERSONNEL', '["Politics", "Government", "Elections"]'::jsonb, 720),
    ('MONETARY_POLICY_FED', '["Economics", "Fed", "Interest Rates"]'::jsonb, 180),
    ('INTERNATIONAL_CONFLICT', '["World", "Geopolitics", "War"]'::jsonb, 60),
    ('SHUTDOWN_BUDGET', '["Politics", "Congress", "Budget"]'::jsonb, 360),
    ('CRYPTO_REGULATION', '["Crypto", "Regulation", "Financials"]'::jsonb, 480),
    ('IMMIGRATION', '["Politics", "Immigration"]'::jsonb, 720)
ON CONFLICT (topic) DO NOTHING;
