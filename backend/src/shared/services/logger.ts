import pino from "pino";

/**
 * Shared structured logger. Never use console.log in production code.
 */
export const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined
});
