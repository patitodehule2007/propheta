import Redis from "ioredis";

import { config } from "../../config";
import { logger } from "../../shared/services/logger";

/**
 * Shared Redis connection, used to cache scraped page content so repeated
 * links across posts do not re-hit the network. `lazyConnect` defers the
 * actual TCP connection to the first command instead of blocking startup.
 */
export const redisClient = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    lazyConnect: true
});

redisClient.on("error", (err) => {
    logger.error({ err }, "Redis connection error");
});
