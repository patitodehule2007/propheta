/**
 * Centralized application configuration. Never read process.env anywhere else.
 */

/**
 * Reads a required environment variable, throwing when it is missing or empty.
 * @param name - name of the environment variable
 * @returns the variable value
 * @throws {Error} when the variable is not set
 */
function requiredEnv(name: string): string {
    const value = getEnv(name);
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function getEnv(name: string): string | undefined {
    return process.env[name];
}

export const config = {
    env: getEnv("NODE_ENV") ?? "development",
    port: Number(getEnv("PORT") ?? 5000),
    db: {
        host: getEnv("DB_HOST") ?? "db",
        port: Number(getEnv("DB_PORT") ?? 5432),
        name: getEnv("DB_NAME") ?? "propheta",
        user: getEnv("DB_USER") ?? "app_user",
        password: requiredEnv("DB_PASSWORD"),
        poolMax: Number(getEnv("DB_POOL_MAX") ?? 10)
    },
    redis: {
        host: getEnv("REDIS_HOST") ?? "redis",
        port: Number(getEnv("REDIS_PORT") ?? 6379),
        password: requiredEnv("REDIS_PASSWORD")
    },
    auth: {
        saltRounds: Number(getEnv("SALT_ROUNDS") ?? 10),
        secretKey: requiredEnv("SECRET_KEY"),
        accessTokenTtl: getEnv("TIME_ACCESS_TOKEN_LAST") ?? "15m",
        refreshTokenTtl: getEnv("TIME_REFRESH_TOKEN_LAST") ?? "7d"
    },
    cors: {
        allowedOrigins: (getEnv("CORS_ALLOWED_ORIGINS") ?? "http://localhost:3000").split(",")
    },
    xApi: {
        baseUrl: getEnv("X_API_BASE_URL") ?? "https://api.x.com",
        webhookConsumerSecret:
            getEnv("NODE_ENV") === "development"
                ? (getEnv("X_WEBHOOK_CONSUMER_SECRET") ?? "")
                : requiredEnv("X_WEBHOOK_CONSUMER_SECRET"),
        bearerToken:
            getEnv("NODE_ENV") === "development" ? (getEnv("X_BEARER_TOKEN") ?? "") : requiredEnv("X_BEARER_TOKEN"),
        targetUrl: requiredEnv("X_WEBHOOK_TARGET_URL")
    },
    dryRun: (process.env.DRY_RUN ?? "true") === "true"
} as const;
