CREATE FUNCTION insert_decision_log(
    p_ingested_post_id uuid,
    p_platform_post_id text,
    p_stage text,
    p_decision text,
    p_reason text,
    p_metadata jsonb
)
RETURNS TABLE (
    id uuid,
    ingested_post_id uuid,
    platform_post_id text,
    stage text,
    decision text,
    reason text,
    metadata jsonb,
    created_at timestamptz
)
LANGUAGE sql
AS $$
    INSERT INTO decision_log (ingested_post_id, platform_post_id, stage, decision, reason, metadata)
    VALUES (p_ingested_post_id, p_platform_post_id, p_stage, p_decision, p_reason, p_metadata)
    RETURNING id, ingested_post_id, platform_post_id, stage, decision, reason, metadata, created_at;
$$;
