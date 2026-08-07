CREATE FUNCTION upsert_x_webhook_subscription(
    p_monitored_account_id uuid,
    p_event_type text,
    p_platform_subscription_id text,
    p_webhook_id text
)
RETURNS TABLE (
    id uuid,
    monitored_account_id uuid,
    event_type text,
    platform_subscription_id text,
    webhook_id text
)
LANGUAGE sql
AS $$
    INSERT INTO x_webhook_subscriptions (monitored_account_id, event_type, platform_subscription_id, webhook_id)
    VALUES (p_monitored_account_id, p_event_type, p_platform_subscription_id, p_webhook_id)
    ON CONFLICT (platform_subscription_id) DO UPDATE
        SET webhook_id = EXCLUDED.webhook_id,
            updated_at = now()
    RETURNING id, monitored_account_id, event_type, platform_subscription_id, webhook_id;
$$;
