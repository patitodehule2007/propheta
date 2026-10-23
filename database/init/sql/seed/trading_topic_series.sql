-- Hand-picked topic -> Kalshi series whitelist (docs/backend/trading.md
-- "Topic table"). Kalshi tags were too coarse to stand in for topic relevance:
-- one tag spans hundreds of series, so ranking by volume let off-topic markets
-- (TSA counts, mention markets) crowd every relevant one out of the candidate
-- cap. Picked by keyword from series titles and reviewed by hand; a series may
-- serve several topics. Recurring series with no open market right now (Fed
-- chair, shutdown) stay listed -- the cache refresh picks them up when Kalshi
-- reopens them.

-- Replaces the whole list, so removing a line here removes the series.
-- Runs after trading_topic_map.sql (files load in name order).

-- Updated as of 23/10/26
DELETE FROM topic_market_series;

INSERT INTO topic_market_series (topic_market_map_id, series_ticker)
SELECT t.id, v.series_ticker
FROM
    (
        VALUES
            ('TARIFFS_TRADE', 'KXDJTVOSTARIFFS'),
            ('TARIFFS_TRADE', 'KXCONGRESSTARIFFVOTE'),
            ('TARIFFS_TRADE', 'KXTARIFFBILL'),
            ('TARIFFS_TRADE', 'KXTARIFFREFUND'),
            ('TARIFFS_TRADE', 'KXTARIFFSECTOR'),
            ('TARIFFS_TRADE', 'KXGLOBALTARIFFS'),
            ('TARIFFS_TRADE', 'KXGENERICTARIFF'),
            ('TARIFFS_TRADE', 'KXCOPPERCABLE'),
            ('TARIFFS_TRADE', 'KXTARIFFRATECA'),
            ('TARIFFS_TRADE', 'KXTARIFFRATEMEX'),
            ('TARIFFS_TRADE', 'KXTARIFFRATEEU'),
            ('TARIFFS_TRADE', 'KXTARIFFRATEPRC'),
            ('TARIFFS_TRADE', 'KXTARIFFRATEJP'),
            ('TARIFFS_TRADE', 'KXTARIFFRATEKR'),
            ('TARIFFS_TRADE', 'KXTARIFFRATEBR'),
            ('TARIFFS_TRADE', 'KXTARIFFRATEINDIA'),
            ('APPOINTMENTS_PERSONNEL', 'KXFEDCHAIRNOM'),
            ('APPOINTMENTS_PERSONNEL', 'KXPRESNOMFEDCHAIR'),
            ('APPOINTMENTS_PERSONNEL', 'KXFEDCHAIRCONFIRM'),
            ('APPOINTMENTS_PERSONNEL', 'KXFEDCHAIRCONFIRMED'),
            ('APPOINTMENTS_PERSONNEL', 'KXCABOUT'),
            ('APPOINTMENTS_PERSONNEL', 'KXNEXTPRESSEC'),
            ('APPOINTMENTS_PERSONNEL', 'KXKASHOUT'),
            ('APPOINTMENTS_PERSONNEL', 'KXGABBARDOUT'),
            ('APPOINTMENTS_PERSONNEL', 'KXNOEMOUT'),
            ('APPOINTMENTS_PERSONNEL', 'KXZACHARIAOUT'),
            ('APPOINTMENTS_PERSONNEL', 'KXNEWSCOTUSCONF'),
            ('APPOINTMENTS_PERSONNEL', 'KXSURGEON'),
            ('APPOINTMENTS_PERSONNEL', 'KXNEXTDEF'),
            ('APPOINTMENTS_PERSONNEL', 'KXNEXTSTATE'),
            ('APPOINTMENTS_PERSONNEL', 'KXNEXTDHSSEC'),
            ('APPOINTMENTS_PERSONNEL', 'KXSECCHAIR'),
            ('MONETARY_POLICY_FED', 'KXFEDDECISION'),
            ('MONETARY_POLICY_FED', 'KXFED'),
            ('MONETARY_POLICY_FED', 'KXRATECUTCOUNT'),
            ('MONETARY_POLICY_FED', 'KXFEDCOMBO'),
            ('MONETARY_POLICY_FED', 'TERMINALRATE'),
            ('MONETARY_POLICY_FED', 'KXEMERCUTS'),
            ('MONETARY_POLICY_FED', 'KXFEDMEET'),
            ('MONETARY_POLICY_FED', 'KXFOMCDISSENTCOUNT'),
            ('MONETARY_POLICY_FED', 'KXDOTPLOT'),
            ('MONETARY_POLICY_FED', 'KXFEDFUNDSYEAR'),
            ('MONETARY_POLICY_FED', 'KXFEDCHAIRNOM'),
            ('MONETARY_POLICY_FED', 'KXFEDCHAIRCONFIRM'),
            ('INTERNATIONAL_CONFLICT', 'KXUSAIRANAGREEMENT'),
            ('INTERNATIONAL_CONFLICT', 'KXIAEAIRANAGREEMENT'),
            ('INTERNATIONAL_CONFLICT', 'KXTRUMPSUPREMELEADER'),
            ('INTERNATIONAL_CONFLICT', 'KXVENEZUELALEADER'),
            ('INTERNATIONAL_CONFLICT', 'KXUKRAINE'),
            ('INTERNATIONAL_CONFLICT', 'KXZELENSKYYOUT'),
            ('INTERNATIONAL_CONFLICT', 'KXRECOGROC'),
            ('INTERNATIONAL_CONFLICT', 'KXISRNORMCOUNT'),
            ('SHUTDOWN_BUDGET', 'KXGOVSHUT'),
            ('SHUTDOWN_BUDGET', 'KXGOVTSHUTLENGTH'),
            ('SHUTDOWN_BUDGET', 'KXGOVSHUTLENGTH'),
            ('SHUTDOWN_BUDGET', 'KXSHUTDOWNBY'),
            ('SHUTDOWN_BUDGET', 'KXNUMSHUTDOWNS'),
            ('SHUTDOWN_BUDGET', 'KXVOTESHUTDOWNS'),
            ('SHUTDOWN_BUDGET', 'KXVOTESHUTDOWNH'),
            ('SHUTDOWN_BUDGET', 'KXGOVTFUNDLENGTH'),
            ('SHUTDOWN_BUDGET', 'KXGOVTFUNDHVOTES'),
            ('SHUTDOWN_BUDGET', 'KXNUMAPPROP'),
            ('SHUTDOWN_BUDGET', 'KXSENATEREC'),
            ('SHUTDOWN_BUDGET', 'KXRECNCH'),
            ('SHUTDOWN_BUDGET', 'KXDCEILEND'),
            ('CRYPTO_REGULATION', 'KXCRYPTOSTRUCTURE'),
            ('CRYPTO_REGULATION', 'KXCLARITYACT'),
            ('CRYPTO_REGULATION', 'KXCLARITYVOTE'),
            ('CRYPTO_REGULATION', 'KXVOTECLARITY'),
            ('CRYPTO_REGULATION', 'KXSVOTECLARITY'),
            ('CRYPTO_REGULATION', 'KXGENIUS'),
            ('CRYPTO_REGULATION', 'KXSTABLECOIN'),
            ('CRYPTO_REGULATION', 'KXBTCRESERVE'),
            ('CRYPTO_REGULATION', 'KXBTCRESERVECOUNTRY'),
            ('IMMIGRATION', 'KXDEPORTCOUNT'),
            ('IMMIGRATION', 'KXDEPORTATIONS'),
            ('IMMIGRATION', 'KX14AMENDCASE'),
            ('IMMIGRATION', 'KXNGUARDCITY'),
            ('IMMIGRATION', 'KXNATLGUARDDC'),
            ('IMMIGRATION', 'KXICEREFORM'),
            ('IMMIGRATION', 'KXICEERO'),
            ('IMMIGRATION', 'KXVISAREVOKE')
    ) AS v (topic, series_ticker)
    JOIN topic_market_map AS t ON t.topic = v.topic;
