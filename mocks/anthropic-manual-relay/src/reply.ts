import { randomUUID } from "crypto";

import { callableTools, isStructuredRequest } from "./render";
import { AssistantTurn, ContentBlock, MessagesRequest } from "./types";

const TOOL_CALL_BLOCK = /```tool_call\s*\n([\s\S]*?)```/g;
const JSON_FENCE = /```(?:json)?\s*\n([\s\S]*?)```/;

/** A pasted reply that cannot be turned into an API response; the human fixes it and resends. */
export class ReplyFormatError extends Error {}

/**
 * Converts a reply pasted from a Claude chat into the assistant turn the
 * backend expects for the request it answers.
 *
 * @throws {ReplyFormatError} When the reply is empty, a tool_call block is
 * malformed or names a tool the request did not offer, or a structured reply
 * is not valid JSON.
 */
export function buildAssistantTurn(reply: string, request: MessagesRequest): AssistantTurn {
    if (reply.trim().length === 0) throw new ReplyFormatError("Reply is empty.");
    if (isStructuredRequest(request)) return buildStructuredTurn(reply);
    return buildToolTurn(reply, request);
}

/**
 * Schema conformance is left to the backend's own zod validation on purpose,
 * so a wrong-shaped answer exercises the real failure path. Only JSON syntax
 * is checked here, to catch copy-paste mistakes.
 */
function buildStructuredTurn(reply: string): AssistantTurn {
    const fenced = reply.match(JSON_FENCE);
    const json = (fenced ? fenced[1] : reply).trim();
    try {
        JSON.parse(json);
    } catch (err) {
        throw new ReplyFormatError(`Reply is not valid JSON: ${(err as Error).message}`);
    }
    return { content: [{ type: "text", text: json }], stopReason: "end_turn" };
}

function buildToolTurn(reply: string, request: MessagesRequest): AssistantTurn {
    const allowedNames = new Set(callableTools(request).map((tool) => tool.name));
    const toolUses = Array.from(reply.matchAll(TOOL_CALL_BLOCK), (match) => parseToolCall(match[1], allowedNames));
    const text = reply.replace(TOOL_CALL_BLOCK, "").trim();

    const content: ContentBlock[] = text.length > 0 ? [{ type: "text", text }] : [];
    return {
        content: [...content, ...toolUses],
        stopReason: toolUses.length > 0 ? "tool_use" : "end_turn"
    };
}

function parseToolCall(raw: string, allowedNames: Set<string>): ContentBlock {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new ReplyFormatError(`tool_call block is not valid JSON: ${(err as Error).message}`);
    }

    const call = (parsed ?? {}) as { name?: unknown; input?: unknown };
    if (typeof call.name !== "string" || !allowedNames.has(call.name)) {
        throw new ReplyFormatError(`tool_call names an unknown tool: ${String(call.name)}`);
    }
    const input = typeof call.input === "object" && call.input !== null ? call.input : {};
    return { type: "tool_use", id: `toolu_${randomUUID()}`, name: call.name, input };
}
