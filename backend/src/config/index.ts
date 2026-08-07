import dotenv from "dotenv";

dotenv.config();

/**
 * Centralized application configuration. Never read process.env anywhere else.
 */
export const config = {
    env: process.env.NODE_ENV ?? "development",
    port: Number(process.env.PORT ?? 5000),
    db: {
        host: process.env.DB_HOST ?? "db",
        port: Number(process.env.DB_PORT ?? 5432),
        name: process.env.DB_NAME ?? "propheta",
        user: process.env.DB_USER ?? "app_user",
        password: process.env.DB_PASSWORD ?? "",
        poolMax: Number(process.env.DB_POOL_MAX ?? 10)
    },
    redis: {
        host: process.env.REDIS_HOST ?? "redis",
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD ?? ""
    },
    auth: {
        saltRounds: Number(process.env.SALT_ROUNDS ?? 10),
        secretKey: process.env.SECRET_KEY ?? "",
        accessTokenTtl: process.env.TIME_ACCESS_TOKEN_LAST ?? "15m",
        refreshTokenTtl: process.env.TIME_REFRESH_TOKEN_LAST ?? "7d"
    },
    cors: {
        allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000").split(",")
    },
    xApi: {
        baseUrl: process.env.X_API_BASE_URL ?? "https://api.x.com",
        webhookConsumerSecret: process.env.X_WEBHOOK_CONSUMER_SECRET ?? "",
        bearerToken: process.env.X_BEARER_TOKEN ?? ""
    },
    dryRun: (process.env.DRY_RUN ?? "true") === "true"
} as const;
