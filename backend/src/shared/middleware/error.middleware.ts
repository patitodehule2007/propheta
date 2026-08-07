import { NextFunction, Request, Response } from "express";
import { AppError } from "../core/errors";
import { logger } from "../services/logger";

/**
 * Centralized error handler. Maps typed errors to status codes and the
 * standard error shape; logs everything else server-side.
 */
export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
    if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
        return;
    }

    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}
