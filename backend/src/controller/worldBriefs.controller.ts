import { Request, Response } from "express";

import {
    BRIEFABLE_TOPICS,
    BriefableTopic,
    generateBrief,
    manualWorldBriefSchema,
    saveManualBrief
} from "../modules/worldContext";
import { getLatestWorldBriefs, listWorldBriefs } from "../repositories/postgres/worldBrief.repository";
import { ValidationError } from "../shared/core/errors";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function parseTopic(req: Request): BriefableTopic {
    const topic = req.params.topic;
    const match = BRIEFABLE_TOPICS.find((candidate) => candidate === topic);
    if (!match) {
        throw new ValidationError(`topic must be one of ${BRIEFABLE_TOPICS.join(", ")}`);
    }
    return match;
}

/**
 * The live brief of every topic that has one. Bounded by the topic taxonomy.
 */
export async function listLatestBriefs(_req: Request, res: Response): Promise<void> {
    const items = await getLatestWorldBriefs();
    res.status(200).json({ data: { items }, message: "World briefs retrieved" });
}

/**
 * Paginated version history for one topic, newest first.
 */
export async function listBriefHistory(req: Request, res: Response): Promise<void> {
    const topic = parseTopic(req);
    const limit = Math.min(Number(req.query.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const offset = Number(req.query.offset ?? 0);

    if (!Number.isInteger(limit) || limit <= 0 || !Number.isInteger(offset) || offset < 0) {
        throw new ValidationError("limit and offset must be positive integers");
    }

    const { items, totalCount } = await listWorldBriefs({ topic, limit, offset });
    res.status(200).json({ data: { items, totalCount, limit, offset }, message: "World brief history retrieved" });
}

/**
 * Stores an operator-written brief as the topic's new live version.
 */
export async function putManualBrief(req: Request, res: Response): Promise<void> {
    const topic = parseTopic(req);
    const parsed = manualWorldBriefSchema.safeParse(req.body);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new ValidationError(issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid brief");
    }
    const brief = await saveManualBrief(topic, parsed.data);
    res.status(201).json({ data: brief, message: "World brief saved" });
}

/**
 * Researches the topic with web search and stores the result as its new live
 * version. Synchronous: the response waits for the model.
 */
export async function postGenerateBrief(req: Request, res: Response): Promise<void> {
    const topic = parseTopic(req);
    const brief = await generateBrief(topic);
    res.status(201).json({ data: brief, message: "World brief generated" });
}
