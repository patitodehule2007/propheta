import Anthropic from "@anthropic-ai/sdk";

import { scrapePageCached } from "../scraping/scrapeCache.service";
import { logger } from "../../shared/services/logger";
import { isScrapableUrl } from "../../shared/services/webScraper";

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
    deferLoading: true,
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
            return markdown ?? "The page returned no readable content.";
        } catch (err) {
            logger.warn({ err, url }, "parse_url tool failed to fetch a page");
            return "Failed to fetch this page. It may be unreachable, blocked, or not HTML — try web_fetch instead.";
        }
    }
};

export const toolRegistry: ToolRegistryEntry[] = [searchToolsTool, parseUrlTool];

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
