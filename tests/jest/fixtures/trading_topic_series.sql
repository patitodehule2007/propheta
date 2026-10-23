-- Test-only topic -> series whitelist. docker-compose.jest.yml mounts this
-- file over database/init/sql/seed/trading_topic_series.sql, so the test stack
-- only ever refreshes the series kalshi-mock serves (mocks/kalshi-mock/src/state.ts):
--
-- - KXTARIFF  -- TARIFFS_TRADE only. The happy-path market.
-- - KXTEST    -- MONETARY_POLICY_FED, APPOINTMENTS_PERSONNEL,
--                INTERNATIONAL_CONFLICT and CRYPTO_REGULATION.
-- - KXLOWVOL  -- SHUTDOWN_BUDGET only; below TRADE_MIN_SERIES_VOLUME.
--
-- IMMIGRATION deliberately has no series (gate 2's no_open_market case).
DELETE FROM topic_market_series;

INSERT INTO topic_market_series (topic_market_map_id, series_ticker)
SELECT t.id, v.series_ticker
FROM
    (
        VALUES
            ('TARIFFS_TRADE', 'KXTARIFF'),
            ('MONETARY_POLICY_FED', 'KXTEST'),
            ('APPOINTMENTS_PERSONNEL', 'KXTEST'),
            ('INTERNATIONAL_CONFLICT', 'KXTEST'),
            ('CRYPTO_REGULATION', 'KXTEST'),
            ('SHUTDOWN_BUDGET', 'KXLOWVOL')
    ) AS v (topic, series_ticker)
    JOIN topic_market_map AS t ON t.topic = v.topic;
