import { Request, Response } from "express";

/**
 * Health check used by the container healthcheck and orchestration.
 */
export function healthController(_req: Request, res: Response): void {
    res.status(200).json({ data: { status: "ok" }, message: "Service is healthy" });
}
