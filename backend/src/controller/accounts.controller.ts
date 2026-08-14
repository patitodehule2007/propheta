import { Request, Response } from "express";
import { z } from "zod";

import { addMonitoredAccount } from "../modules/ingestion/ingestion.service";
import { deactivateMonitoredAccount, listMonitoredAccounts } from "../repositories/postgres/ingestion.repository";
import { ValidationError } from "../shared/core/errors";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const addAccountSchema = z.object({
    handle: z.string().min(1)
});

/**
 * Paginated read of every monitored account.
 */
export async function listAccounts(req: Request, res: Response): Promise<void> {
    const limit = Math.min(Number(req.query.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const offset = Number(req.query.offset ?? 0);

    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(offset) || offset < 0) {
        throw new ValidationError("limit and offset must be positive numbers");
    }

    const { items, totalCount } = await listMonitoredAccounts({ limit, offset });
    res.status(200).json({ data: { items, totalCount, limit, offset }, message: "Accounts retrieved" });
}

/**
 * Resolves a handle via the X API and adds it to the monitored set.
 */
export async function createAccount(req: Request, res: Response): Promise<void> {
    const { handle } = addAccountSchema.parse(req.body);
    const account = await addMonitoredAccount(handle);
    res.status(201).json({ data: account, message: "Account added" });
}

/**
 * Deactivates (soft-deletes) a monitored account.
 */
export async function deleteAccount(req: Request, res: Response): Promise<void> {
    const id = req.params.id;
    if (typeof id !== "string" || id.length === 0) {
        throw new ValidationError("A valid account id is required");
    }
    const account = await deactivateMonitoredAccount(id);
    res.status(200).json({ data: account, message: "Account removed" });
}
