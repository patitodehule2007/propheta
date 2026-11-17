import Anthropic from "@anthropic-ai/sdk";

import {
    getKalshiMarketByTicker,
    getKalshiMarketsByTickers,
    getRecentClassificationsByHandle,
    searchKalshiMarkets
} from "../../repositories/postgres/trading.repository";
import { getQuoteSamplesSince } from "../../repositories/redis/marketQuote.repository";
import { logger } from "../../shared/services/logger";
import { isScrapableUrl } from "../../shared/services/webScraper";
import { KALSHI_MARKET_STATUS } from "../kalshi";
import { scrapePageCached } from "../scraping/scrapeCache.service";
import { computeFeePerContractCents } from "../trading/pricing";
import { getLiveOrCachedQuote } from "../trading/quote.service";
import { RECENT_POSTS_WINDOW_DAYS } from "../trading/trading.constants";
import { PARSE_URL_MAX_CHARS } from "./agent.constants";

/**
 * `Anthropic.ToolReferenceBlockParam` blocks are the documented contract for
 * a custom tool search implementation (`search_tools` below) to surface a
 * deferred tool: return them in a `tool_result` and the API expands them
 * into full tool definitions, the same way the server-side tool search
 * variants do.
 */
export type ToolRunResult = string | Anthropic.ToolReferenceBlockParam[];

/**
 * One entry in the tool catalog. This file is the single place a new tool is
 * declared — `toAnthropicTools()` and `executeRegistryTool()` both derive
 * from `toolRegistry`, so nothing else needs to change to add one.
 */
export interface ToolRegistryEntry {
    name: string;
    description: string;
    /** Extra terms `search_tools` matches against, beyond name/description. */
    keywords: string[];
    /**
     * When true, the tool's full definition is still sent on every request
     * (the API needs it to run the search) but is not loaded into the
     * model's context until `search_tools` surfaces it. Keep the catalog's
     * entry point (`search_tools` itself) non-deferred.
     */
    deferLoading: boolean;
    inputSchema: Anthropic.Tool.InputSchema;
    run: (input: Record<string, unknown>) => Promise<ToolRunResult>;
}

const PAGE_TRUNCATED_NOTE = "\n\n[Page truncated: only the beginning is shown.]";

/**
 * Tool output stays in the transcript and is re-read on every later request of
 * the run, so long pages are cut to `PARSE_URL_MAX_CHARS`.
 */
function capPageContent(markdown: string): string {
    if (markdown.length <= PARSE_URL_MAX_CHARS) {
        return markdown;
    }
    return markdown.slice(0, PARSE_URL_MAX_CHARS) + PAGE_TRUNCATED_NOTE;
}

const searchToolsTool: ToolRegistryEntry = {
    name: "search_tools",
    description:
        "Search the tool catalog by a case-insensitive regex matched against every other tool's name, " +
        "description and keywords. Call this to discover which tool to use before calling it.",
    keywords: ["search", "discover", "catalog", "grep", "find"],
    deferLoading: false,
    inputSchema: {
        type: "object",
        properties: {
            pattern: {
                type: "string",
                description: "Regex pattern, e.g. 'scrape|fetch|url'."
            }
        },
        required: ["pattern"]
    },
    run: async (input) => {
        const pattern = String(input.pattern ?? "");
        let regex: RegExp;
        try {
            regex = new RegExp(pattern, "i");
        } catch {
            return `Invalid regex pattern: ${pattern}`;
        }

        const matches = toolRegistry.filter((tool) => {
            if (tool.name === searchToolsTool.name) return false;
            const haystack = `${tool.name} ${tool.description} ${tool.keywords.join(" ")}`;
            return regex.test(haystack);
        });

        if (matches.length === 0) return "No tools matched that pattern.";
        return matches.map((tool) => ({ type: "tool_reference" as const, tool_name: tool.name }));
    }
};

const parseUrlTool: ToolRegistryEntry = {
    name: "parse_url",
    description:
        "Fetch a URL linked from the post and return its main content as markdown. Use this to read an " +
        "article, press release, or executive order before judging a post that links out.",
    keywords: ["scrape", "url", "fetch", "article", "link", "read", "page"],
    // Loaded up front: both agents use it on the hot path, and discovering it
    // through search_tools costs a full extra request.
    deferLoading: false,
    inputSchema: {
        type: "object",
        properties: {
            url: {
                type: "string",
                description: "Absolute http(s) URL to fetch."
            }
        },
        required: ["url"]
    },
    run: async (input) => {
        const url = String(input.url ?? "");
        if (!isScrapableUrl(url)) {
            return "This URL cannot be fetched: it is not a valid public http(s) address.";
        }

        try {
            const markdown = await scrapePageCached(url);
            return markdown === null ? "The page returned no readable content." : capPageContent(markdown);
        } catch (err) {
            logger.warn({ err, url }, "parse_url tool failed to fetch a page");
            return "Failed to fetch this page. It may be unreachable, blocked, or not HTML — try web_fetch instead.";
        }
    }
};

const MAX_QUOTE_TICKERS = 20;
const MS_PER_MINUTE = 60_000;

const getMarketRulesTool: ToolRegistryEntry = {
    name: "get_market_rules",
    description:
        "Read a Kalshi market's settlement rules and metadata: title, yes_sub_title, rules_primary, " +
        "rules_secondary, close time and additional_prohibitions. A title is a summary; rules_primary is " +
        "the contract -- always call this before proposing a market.",
    keywords: ["market", "rules", "settlement", "kalshi", "ticker", "prohibitions"],
    // Loaded up front for the same reason as parse_url.
    deferLoading: false,
    inputSchema: {
        type: "object",
        properties: { ticker: { type: "string", description: "Kalshi market ticker." } },
        required: ["ticker"]
    },
    run: async (input) => {
        const ticker = String(input.ticker ?? "");
        const market = await getKalshiMarketByTicker(ticker);
        if (!market) return `No cached market found for ticker ${ticker}.`;
        return JSON.stringify(market);
    }
};

const getMarketQuoteTool: ToolRegistryEntry = {
    name: "get_market_quote",
    description:
        "Refresh the quoted YES/NO ask, spread, top-of-book size and fee per contract for up to 20 " +
        "market tickers. Prices are already derived from the bids-only order book -- never recompute them.",
    keywords: ["quote", "price", "ask", "spread", "fee", "orderbook"],
    deferLoading: true,
    inputSchema: {
        type: "object",
        properties: {
            tickers: {
                type: "array",
                items: { type: "string" },
                description: "Up to 20 Kalshi market tickers."
            }
        },
        required: ["tickers"]
    },
    run: async (input) => {
        const tickers = (Array.isArray(input.tickers) ? input.tickers.map(String) : []).slice(0, MAX_QUOTE_TICKERS);
        if (tickers.length === 0) return "No tickers provided.";

        const marketInfo = await getKalshiMarketsByTickers(tickers);
        const marketByTicker = new Map(marketInfo.map((market) => [market.ticker, market]));

        const quotes = await Promise.all(
            tickers.map(async (ticker) => {
                const market = marketByTicker.get(ticker);
                if (!market) return { ticker, error: "Unknown or uncached ticker." };

                const sample = await getLiveOrCachedQuote(ticker);
                const feePerContractAtAsk =
                    sample.yesAskCents === null
                        ? null
                        : computeFeePerContractCents(sample.yesAskCents, market.feeType, market.feeMultiplier);

                return {
                    ticker,
                    yesAsk: sample.yesAskCents,
                    noAsk: sample.noAskCents,
                    spreadCents: sample.spreadCents,
                    topOfBookContracts: sample.topOfBookContracts,
                    feePerContractAtAsk,
                    status: market.status
                };
            })
        );

        return JSON.stringify(quotes);
    }
};

const getPriceHistoryTool: ToolRegistryEntry = {
    name: "get_price_history",
    description:
        "Read recent quote samples for one market, plus the price at the post's signal time and the move " +
        "since then. Use this to check whether the market already moved before you arrived.",
    keywords: ["history", "price", "move", "signal", "late", "samples"],
    deferLoading: true,
    inputSchema: {
        type: "object",
        properties: {
            ticker: { type: "string", description: "Kalshi market ticker." },
            sinceMinutes: { type: "number", description: "How many minutes of history to read." }
        },
        required: ["ticker", "sinceMinutes"]
    },
    run: async (input) => {
        const ticker = String(input.ticker ?? "");
        const sinceMinutes = Number(input.sinceMinutes ?? 60);
        const samples = await getQuoteSamplesSince(ticker, Date.now() - sinceMinutes * MS_PER_MINUTE);
        if (samples.length === 0) return `No quote history recorded yet for ${ticker}.`;

        const priceAtSignal = samples[0]?.yesAskCents ?? null;
        const latest = samples[samples.length - 1];
        const moveSinceSignalCents =
            priceAtSignal === null || !latest || latest.yesAskCents === null
                ? null
                : latest.yesAskCents - priceAtSignal;

        return JSON.stringify({ ticker, priceAtSignal, moveSinceSignalCents, samples });
    }
};

const findMarketsTool: ToolRegistryEntry = {
    name: "find_markets",
    description:
        "Escape hatch: search the cached market catalog by tags, series ticker or a text query. Use this " +
        "only when every candidate you were given fails on its settlement rules, not for browsing.",
    keywords: ["find", "search", "candidates", "escape hatch"],
    deferLoading: true,
    inputSchema: {
        type: "object",
        properties: {
            tags: { type: "array", items: { type: "string" }, description: "Kalshi series tags to filter by." },
            seriesTicker: { type: "string", description: "Restrict to one series." },
            query: { type: "string", description: "Free-text match against the market title." }
        },
        required: []
    },
    run: async (input) => {
        const tags = Array.isArray(input.tags) ? input.tags.map(String) : null;
        const seriesTicker = typeof input.seriesTicker === "string" ? input.seriesTicker : null;
        const queryText = typeof input.query === "string" ? input.query : null;
        const results = await searchKalshiMarkets({
            status: KALSHI_MARKET_STATUS.ACTIVE,
            minCloseTime: new Date().toISOString(),
            tags,
            seriesTicker,
            queryText,
            limit: MAX_QUOTE_TICKERS
        });
        if (results.length === 0) return "No open markets matched that search.";
        return JSON.stringify(results);
    }
};

const getAuthorRecentPostsTool: ToolRegistryEntry = {
    name: "get_author_recent_posts",
    description:
        "Read a monitored account's recent classified posts on a topic, for novelty context: has this " +
        "author already said this, in this direction, recently?",
    keywords: ["novelty", "recent", "author", "handle", "history", "repeat"],
    deferLoading: true,
    inputSchema: {
        type: "object",
        properties: {
            handle: { type: "string", description: "Monitored account handle." },
            topic: { type: "string", description: "Topic to filter by." },
            limit: { type: "number", description: "Maximum posts to return." }
        },
        required: ["handle", "topic"]
    },
    run: async (input) => {
        const handle = String(input.handle ?? "");
        const topic = String(input.topic ?? "");
        const limit = Number(input.limit ?? 10);
        const since = new Date(Date.now() - RECENT_POSTS_WINDOW_DAYS * 24 * 60 * MS_PER_MINUTE).toISOString();
        const posts = await getRecentClassificationsByHandle({ handle, topic, since, limit });
        if (posts.length === 0) return `No recent classified posts found for @${handle} on ${topic}.`;
        return JSON.stringify(posts);
    }
};

export const toolRegistry: ToolRegistryEntry[] = [
    searchToolsTool,
    parseUrlTool,
    getMarketRulesTool,
    getMarketQuoteTool,
    getPriceHistoryTool,
    findMarketsTool,
    getAuthorRecentPostsTool
];

/**
 * Builds the `tools` array entries for these registry tools.
 */
export function toAnthropicTools(): Anthropic.Tool[] {
    return toolRegistry.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
        defer_loading: tool.deferLoading
    }));
}

/**
 * Dispatches a tool call by name. Unknown tool names return a plain string
 * result rather than throwing — the loop always has something to feed back
 * as a `tool_result`, never a crash mid-conversation.
 */
export async function executeRegistryTool(name: string, input: Record<string, unknown>): Promise<ToolRunResult> {
    const tool = toolRegistry.find((entry) => entry.name === name);
    if (!tool) return `Unknown tool: ${name}`;
    return tool.run(input);
}
