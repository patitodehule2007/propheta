import pino from "pino";

/**
 * Shared structured logger. Never use console.log in production code.
 */
export const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    formatters: {
        level: (label) => ({ level: label })
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport:
        process.env.NODE_ENV === "development" ? { target: "pino-pretty", options: { colorize: true } } : undefined
});
