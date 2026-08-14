import { Request, Response } from "express";

import { ValidationError } from "../shared/core/errors";
import { ensureWebhookRegistered, handleCrcChallenge, receiveEvent } from "../modules/ingestion/ingestion.service";
import { postCreateEventSchema } from "../modules/ingestion/xWebhook.schema";
import { listDecisionLog } from "../repositories/postgres/ingestion.repository";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Answers X's Challenge-Response Check. Responds with the exact
 * `{ response_token }` shape X requires — this is an external protocol
 * contract, not one of our own `/api` responses, so it does not use the
 * standard `{ data, message }` envelope.
 */
export function crcChallenge(req: Request, res: Response): void {
    const crcToken = req.query.crc_token;
    if (typeof crcToken !== "string" || crcToken.length === 0) {
        throw new ValidationError("Missing crc_token query parameter");
    }
    res.status(200).json(handleCrcChallenge(crcToken));
}

/**
 * Receives a `post.create` webhook delivery. Signature verification and
 * persistence happen in the ingestion service; an invalid signature throws
 * and is mapped to 401 by the centralized error middleware.
 */
export async function receiveWebhookEvent(req: Request, res: Response): Promise<void> {
    const event = postCreateEventSchema.parse(req.body);
    const signatureHeader = req.header("x-twitter-webhooks-signature");
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));

    await receiveEvent(rawBody, signatureHeader, event);

    res.status(200).json({ data: null, message: "Event processed" });
}

/**
 * Paginated read of the ingestion audit log, optionally filtered by
 * platform post id.
 */
export async function listDecisions(req: Request, res: Response): Promise<void> {
    const limit = Math.min(Number(req.query.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const offset = Number(req.query.offset ?? 0);
    const platformPostId = typeof req.query.platformPostId === "string" ? req.query.platformPostId : null;

    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(offset) || offset < 0) {
        throw new ValidationError("limit and offset must be positive numbers");
    }

    const { items, totalCount } = await listDecisionLog({ platformPostId, limit, offset });
    res.status(200).json({ data: { items, totalCount, limit, offset }, message: "Decisions retrieved" });
}

/**
 * Ensures the webhook for `X_WEBHOOK_TARGET_URL` is registered with X,
 * creating it if it doesn't exist yet.
 */
export async function registerWebhook(_req: Request, res: Response): Promise<void> {
    const result = await ensureWebhookRegistered();
    res.status(200).json({
        data: result,
        message: result.created ? "Webhook created" : "Webhook already registered"
    });
}
