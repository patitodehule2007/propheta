import { randomUUID } from "crypto";
import express, { Request, Response } from "express";

import { config } from "./config";
import { buildClassification, FIXTURES } from "./state";

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

interface MockMessage {
    role: string;
    content: unknown;
}

app.post("/v1/messages", (req: Request, res: Response) => {
    const body = req.body as { model?: string; messages?: MockMessage[]; output_config?: unknown };
    const model = body.model ?? "claude-sonnet-5";
    const messages = body.messages ?? [];
    const firstUserContent = String(messages[0]?.content ?? "");
    const urlMatch = firstUserContent.match(URL_REGEX);

    if (body.output_config) {
        // Phase B: the no-tools structured classification call.
        const classification = buildClassification(urlMatch ? [urlMatch[0]] : []);
        res.status(200).json(textResponse(model, JSON.stringify(classification), "end_turn"));
        return;
    }

    // Phase A: the tool-calling loop.
    const assistantTurns = messages.filter((message) => message.role === "assistant").length;

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
