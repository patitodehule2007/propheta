import { randomUUID } from "crypto";
import express, { Request, Response } from "express";

import { config } from "./config";
import {
    buildClassification,
    buildInvalidTradeProposal,
    buildTradeProposal,
    buildWorldBrief,
    extractOverrides,
    extractSelectionOverrides,
    FIXTURES,
    SelectionMode
} from "./state";

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

// --- Fixture pages, for the real scraper (parse_url tool) to fetch ---------

app.get("/fixtures/:name", (req: Request, res: Response) => {
    const html = FIXTURES[String(req.params.name)];
    if (!html) {
        res.status(404).send("Not found");
        return;
    }
    res.status(200).type("html").send(html);
});

// --- Scripted /v1/messages ---------------------------------------------
// Stateless by design: every turn resends the full conversation, so the
// script is derived entirely from the request body (how many assistant
// turns already happened, and whether the post text contains a URL) rather
// than server-side counters. That keeps concurrent/sequential test runs
// from interfering with each other.

const URL_REGEX = /https?:\/\/[^\s<]+/;
const TICKER_REGEX = /"ticker":"([^"]+)"/g;
// The post itself, in the classifier's (`<post_text>`) or the selection
// agent's (`<post author=...>`) prompt. Markers are read only from here: the
// prompts also carry world briefs and the author's earlier posts, whose own
// markers must not leak into this post's script.
const POST_BLOCK_REGEX = /<post_text>([\s\S]*?)<\/post_text>|<post author[^>]*>([\s\S]*?)<\/post>/;
const WORLD_BRIEF_TOPIC_REGEX = /Topic: ([A-Z_]+)/;

interface MockMessage {
    role: string;
    content: unknown;
}

/**
 * `agent.service.ts` (classification) and `selectionAgent.service.ts` (gate 3)
 * both call `/v1/messages` with the same shape; only the `system` prompt text
 * tells them apart, since this mock is stateless and derives everything from
 * the request body. Gate 3's Phase A (`SELECTION_SYSTEM_PROMPT`) and Phase B
 * (`PROPOSAL_SYSTEM_PROMPT`) are two different strings, so both markers are
 * checked.
 */
function isSelectionStage(system: unknown): boolean {
    return (
        typeof system === "string" &&
        (system.includes("market-selection stage") || system.includes("proposal stage of Propheta"))
    );
}

/** `worldBrief.service.ts`'s research and extraction prompts. */
function isWorldBriefStage(system: unknown): boolean {
    return typeof system === "string" && system.includes("world-brief stage of Propheta");
}

/** The post's own text, or the whole prompt when it carries no post block. */
function extractPostText(prompt: string): string {
    const match = prompt.match(POST_BLOCK_REGEX);
    return match ? (match[1] ?? match[2] ?? prompt) : prompt;
}

/** Candidate tickers appear as `"ticker":"..."` in the JSON candidate table. */
function extractCandidateTickers(text: string): string[] {
    return Array.from(text.matchAll(TICKER_REGEX), (match) => match[1]);
}

app.post("/v1/messages", (req: Request, res: Response) => {
    const body = req.body as { model?: string; messages?: MockMessage[]; output_config?: unknown; system?: unknown };
    const model = body.model ?? "claude-sonnet-5";
    const messages = body.messages ?? [];
    const firstUserContent = String(messages[0]?.content ?? "");
    const postText = extractPostText(firstUserContent);
    const urlMatch = postText.match(URL_REGEX);
    const selectionStage = isSelectionStage(body.system);

    if (isWorldBriefStage(body.system)) {
        const topic = firstUserContent.match(WORLD_BRIEF_TOPIC_REGEX)?.[1] ?? "UNKNOWN";
        const text = body.output_config
            ? JSON.stringify(buildWorldBrief(topic))
            : "I searched recent reporting on the topic.";
        res.status(200).json(textResponse(model, text, "end_turn"));
        return;
    }

    if (body.output_config) {
        // Phase B: the no-tools structured extraction call.
        if (selectionStage) {
            const overrides = extractSelectionOverrides(postText);
            const proposal =
                overrides.mode === SelectionMode.INVALID
                    ? buildInvalidTradeProposal()
                    : buildTradeProposal(extractCandidateTickers(firstUserContent), overrides);
            res.status(200).json(textResponse(model, JSON.stringify(proposal), "end_turn"));
            return;
        }
        const classification = buildClassification(urlMatch ? [urlMatch[0]] : [], extractOverrides(postText));
        res.status(200).json(textResponse(model, JSON.stringify(classification), "end_turn"));
        return;
    }

    // Phase A: the tool-calling loop.
    const assistantTurns = messages.filter((message) => message.role === "assistant").length;

    if (selectionStage) {
        const ticker =
            extractSelectionOverrides(postText).ticker ?? extractCandidateTickers(firstUserContent)[0];
        if (assistantTurns === 0 && ticker) {
            res.status(200).json(
                toolUseResponse(model, "get_market_rules", { ticker }, "Checking the settlement rules.")
            );
            return;
        }
        res.status(200).json(textResponse(model, "The candidate's rules match the post.", "end_turn"));
        return;
    }

    if (assistantTurns === 0) {
        res.status(200).json(
            toolUseResponse(
                model,
                "search_tools",
                { pattern: "scrape|url|fetch" },
                "Let me find a tool to read the linked page."
            )
        );
        return;
    }

    if (assistantTurns === 1 && urlMatch) {
        res.status(200).json(toolUseResponse(model, "parse_url", { url: urlMatch[0] }, "Reading the linked page."));
        return;
    }

    res.status(200).json(textResponse(model, "I've reviewed the post and the linked page.", "end_turn"));
});

function toolUseResponse(model: string, name: string, input: Record<string, unknown>, precedingText: string) {
    return {
        id: `msg_${randomUUID()}`,
        type: "message",
        role: "assistant",
        model,
        content: [
            { type: "text", text: precedingText },
            { type: "tool_use", id: `toolu_${randomUUID()}`, name, input }
        ],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 }
    };
}

function textResponse(model: string, text: string, stopReason: string) {
    return {
        id: `msg_${randomUUID()}`,
        type: "message",
        role: "assistant",
        model,
        content: [{ type: "text", text }],
        stop_reason: stopReason,
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 }
    };
}

app.listen(config.port, "0.0.0.0", () => {
    console.log(`anthropic-mock listening on ${config.port}`);
});
