import "express";

declare global {
    namespace Express {
        interface Request {
            /** Exact request body bytes, captured for webhook signature verification. */
            rawBody?: Buffer;
            /** Authenticated user, set by authMiddleware. */
            user?: { id: string; email: string };
        }
    }
}
