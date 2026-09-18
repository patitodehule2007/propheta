-- Gate 4 moves a PROPOSED row to REJECTED (with veto_reason) or EXECUTED.
-- Never re-derives the decision here -- the backend already made it.
CREATE FUNCTION update_trade_proposal_status(p_id uuid, p_status text, p_veto_reason text)
RETURNS TABLE (id uuid, status text, veto_reason text)
LANGUAGE sql
AS $$
    UPDATE trade_proposals
    SET
        status = p_status,
        veto_reason = p_veto_reason,
        updated_at = now()
    WHERE id = p_id
    RETURNING id, status, veto_reason;
$$;
