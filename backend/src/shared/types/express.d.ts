import "express";

declare global {
    namespace Express {
        interface Request {
            /** Exact request body bytes, captured for webhook signature verification. */
            rawBody?: Buffer;
        }
    }
}
