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
        refreshTokenTtl: getEnv("TIME_REFRESH_TOKEN_LAST") ?? "7d",
        // Only read by the admin bootstrap script (shared/scripts/createAdminUser.ts),
        // never by an HTTP endpoint: there is no self-registration.
        adminEmail: getEnv("NODE_ENV") === "development" ? (getEnv("ADMIN_EMAIL") ?? "") : requiredEnv("ADMIN_EMAIL"),
        adminPassword:
            getEnv("NODE_ENV") === "development" ? (getEnv("ADMIN_PASSWORD") ?? "") : requiredEnv("ADMIN_PASSWORD")
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
    anthropic: {
        // Empty in development so the stack boots without a key; the agent
        // module no-ops (with a warn log) when this is empty. Required outside
        // development, same pattern as xApi.bearerToken above.
        apiKey:
            getEnv("NODE_ENV") === "development"
                ? (getEnv("ANTHROPIC_API_KEY") ?? "")
                : requiredEnv("ANTHROPIC_API_KEY"),
        // Only set to repoint at a local mock in tests; undefined lets the SDK
        // use its own default base URL.
        baseUrl: getEnv("ANTHROPIC_BASE_URL"),
        model: getEnv("ANTHROPIC_MODEL") ?? "claude-sonnet-5",
        maxTokens: Number(getEnv("ANTHROPIC_MAX_TOKENS") ?? 16000),
        maxAgentIterations: Number(getEnv("AGENT_MAX_ITERATIONS") ?? 6),
        maxToolCallsPerRun: Number(getEnv("AGENT_MAX_TOOL_CALLS") ?? 10)
    },
    scrapeCache: {
        ttlSeconds: Number(getEnv("SCRAPE_CACHE_TTL_SECONDS") ?? 21_600),
        negativeTtlSeconds: Number(getEnv("SCRAPE_CACHE_NEGATIVE_TTL_SECONDS") ?? 900)
    },
    dryRun: (process.env.DRY_RUN ?? "true") === "true"
} as const;
