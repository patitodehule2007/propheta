/**
 * Centralized application configuration. Never read process.env anywhere else.
 */

import { parseRiskProfile, RISK_PROFILE_PRESETS, RiskProfile } from "./riskProfiles";

export { RiskProfile, RISK_PROFILE_PRESETS } from "./riskProfiles";
export type { RiskProfilePreset } from "./riskProfiles";

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

/**
 * Reads an optional numeric override. Unset and empty both mean "no
 * override", so a blank `VAR=` line in an env file falls back to the preset
 * instead of becoming 0.
 */
function optionalNumberEnv(name: string): number | undefined {
    const value = getEnv(name);
    return value === undefined || value.trim() === "" ? undefined : Number(value);
}

const riskProfile = parseRiskProfile(getEnv("TRADE_RISK_PROFILE") ?? RiskProfile.BALANCED);
const riskPreset = RISK_PROFILE_PRESETS[riskProfile];

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
    kalshi: {
        // Includes the `/trade-api/v2` prefix on purpose: Kalshi signs the full
        // path from the API root, so the prefix has to be part of the URL the
        // signer derives the signed path from. Swap this single value to move
        // between demo and production (https://external-api.kalshi.com/trade-api/v2).
        baseUrl: getEnv("KALSHI_API_BASE_URL") ?? "https://external-api.demo.kalshi.co/trade-api/v2",
        // Empty in development so the stack boots without Kalshi credentials;
        // the client then throws on the first call. Same pattern as
        // anthropic.apiKey above.
        apiKeyId:
            getEnv("NODE_ENV") === "development"
                ? (getEnv("KALSHI_API_KEY_ID") ?? "")
                : requiredEnv("KALSHI_API_KEY_ID"),
        // RSA private key PEM. Env transports it as a single line with escaped
        // newlines, so they are restored here.
        privateKey: (getEnv("NODE_ENV") === "development"
            ? (getEnv("KALSHI_PRIVATE_KEY") ?? "")
            : requiredEnv("KALSHI_PRIVATE_KEY")
        ).replace(/\\n/g, "\n"),
        timeoutMs: Number(getEnv("KALSHI_TIMEOUT_MS") ?? 10_000)
    },
    scrapeCache: {
        ttlSeconds: Number(getEnv("SCRAPE_CACHE_TTL_SECONDS") ?? 21_600),
        negativeTtlSeconds: Number(getEnv("SCRAPE_CACHE_NEGATIVE_TTL_SECONDS") ?? 900)
    },
    dryRun: (getEnv("DRY_RUN") ?? "true") === "true",
    trading: {
        // --- Gates (docs/backend/tradeDecision.md §6.3 + Config) -------------
        // The risk profile sets the appetite fields below; each one's own env
        // var, when set, overrides the preset.
        riskProfile,
        minConfidence: optionalNumberEnv("TRADE_MIN_CONFIDENCE") ?? riskPreset.minConfidence,
        maxSpreadCents: Number(getEnv("MAX_SPREAD_CENTS") ?? 4),
        maxSlippageCents: Number(getEnv("MAX_SLIPPAGE_CENTS") ?? 5),
        minNetEdgeCents: optionalNumberEnv("MIN_NET_EDGE_CENTS") ?? riskPreset.minNetEdgeCents,
        maxTradeExposurePct: optionalNumberEnv("MAX_TRADE_EXPOSURE_PCT") ?? riskPreset.maxTradeExposurePct,
        edgeShrinkage: optionalNumberEnv("TRADE_EDGE_SHRINKAGE") ?? riskPreset.edgeShrinkage,
        maxTopicExposurePct: Number(getEnv("MAX_TOPIC_EXPOSURE_PCT") ?? 5),
        maxDailyLossPct: Number(getEnv("MAX_DAILY_LOSS_PCT") ?? 5),
        maxOrdersPerMinute: Number(getEnv("MAX_ORDERS_PER_MINUTE") ?? 3),
        selectionMaxIterations: Number(getEnv("SELECTION_MAX_ITERATIONS") ?? 2),
        selectionMaxToolCalls: Number(getEnv("SELECTION_MAX_TOOL_CALLS") ?? 6),
        noveltyWindowHours: Number(getEnv("TRADE_NOVELTY_WINDOW_HOURS") ?? 6),
        maxCandidates: Number(getEnv("TRADE_MAX_CANDIDATES") ?? 10),
        minHorizonMinutesFloor: Number(getEnv("TRADE_MIN_HORIZON_MINUTES") ?? 5),
        minSeriesVolume: Number(getEnv("TRADE_MIN_SERIES_VOLUME") ?? 100),
        tradingHorizonMinutes: Number(getEnv("TRADE_HORIZON_MINUTES") ?? 4320),
        // --- Capital base -----------------------------------------------------
        // Config value is the source of truth in dev/tests, where there are no
        // Kalshi credentials to read a live balance from. In production, when
        // credentials exist and DRY_RUN=false, it is overridden by a cached
        // GET /portfolio/balance read.
        capitalBaseCents: Number(getEnv("TRADE_CAPITAL_BASE_CENTS") ?? 100_000),
        balanceCacheMs: Number(getEnv("TRADE_BALANCE_CACHE_MS") ?? 60_000),
        // --- Quote feed (REST polling for v1; WebSocket is phase two) --------
        quotePollEnabled: (getEnv("QUOTE_POLL_ENABLED") ?? "true") === "true",
        quotePollIntervalMs: Number(getEnv("QUOTE_POLL_INTERVAL_MS") ?? 2_000),
        quoteSampleTtlSeconds: Number(getEnv("QUOTE_SAMPLE_TTL_SECONDS") ?? 3_600),
        marketCacheRefreshMs: Number(getEnv("MARKET_CACHE_REFRESH_MS") ?? 300_000),
        // --- Exit policy (docs/backend/tradeDecision.md "Exit policy") -------
        exit: {
            horizonModelWeight: Number(getEnv("EXIT_HORIZON_MODEL_WEIGHT") ?? 0),
            horizonSystem: getEnv("EXIT_HORIZON_SYSTEM") ?? "ATR",
            horizonMinMinutes: Number(getEnv("EXIT_HORIZON_MIN_MINUTES") ?? 5),
            horizonMaxMinutes: Number(getEnv("EXIT_HORIZON_MAX_MINUTES") ?? 1440),
            closeBufferMinutes: Number(getEnv("EXIT_CLOSE_BUFFER_MINUTES") ?? 30),
            atrPeriod: Number(getEnv("EXIT_ATR_PERIOD") ?? 14),
            atrBarSeconds: Number(getEnv("EXIT_ATR_BAR_SECONDS") ?? 60),
            atrMinBars: Number(getEnv("EXIT_ATR_MIN_BARS") ?? 10),
            atrHorizonMultiplier: Number(getEnv("EXIT_ATR_HORIZON_MULTIPLIER") ?? 2.0),
            stopLossAtrMultiplier: Number(getEnv("EXIT_STOP_LOSS_ATR_MULTIPLIER") ?? 2.0),
            stopLossMinCents: Number(getEnv("EXIT_STOP_LOSS_MIN_CENTS") ?? 3),
            stopLossMaxCents: Number(getEnv("EXIT_STOP_LOSS_MAX_CENTS") ?? 15),
            takeProfitEdgeFraction: Number(getEnv("EXIT_TAKE_PROFIT_EDGE_FRACTION") ?? 0.7),
            takeProfitMinNetCents: Number(getEnv("EXIT_TAKE_PROFIT_MIN_NET_CENTS") ?? 2),
            survivalPercentile: Number(getEnv("EXIT_SURVIVAL_PERCENTILE") ?? 75),
            sweepIntervalMs: Number(getEnv("EXIT_SWEEP_INTERVAL_MS") ?? 5_000),
            // Marketable-limit exit slippage bound (open decision 8).
            slippageCents: Number(getEnv("EXIT_SLIPPAGE_CENTS") ?? 5)
        }
    }
} as const;
