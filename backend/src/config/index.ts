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
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const config = {
    env: process.env.NODE_ENV ?? "development",
    port: Number(process.env.PORT ?? 5000),
    db: {
        host: process.env.DB_HOST ?? "db",
        port: Number(process.env.DB_PORT ?? 5432),
        name: process.env.DB_NAME ?? "propheta",
        user: process.env.DB_USER ?? "app_user",
        password: requiredEnv("DB_PASSWORD"),
        poolMax: Number(process.env.DB_POOL_MAX ?? 10)
    },
    redis: {
        host: process.env.REDIS_HOST ?? "redis",
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: requiredEnv("REDIS_PASSWORD")
    },
    auth: {
        saltRounds: Number(process.env.SALT_ROUNDS ?? 10),
        secretKey: requiredEnv("SECRET_KEY"),
        accessTokenTtl: process.env.TIME_ACCESS_TOKEN_LAST ?? "15m",
        refreshTokenTtl: process.env.TIME_REFRESH_TOKEN_LAST ?? "7d"
    },
    cors: {
        allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000").split(",")
    },
    xApi: {
        baseUrl: process.env.X_API_BASE_URL ?? "https://api.x.com",
        webhookConsumerSecret: requiredEnv("X_WEBHOOK_CONSUMER_SECRET"),
        bearerToken: requiredEnv("X_BEARER_TOKEN")
    },
    dryRun: (process.env.DRY_RUN ?? "true") === "true"
} as const;
