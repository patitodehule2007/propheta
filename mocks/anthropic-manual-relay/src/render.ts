import { ApiMessage, ApiTool, ContentBlock, MessagesRequest } from "./types";

const FENCE = "```";
const CUSTOM_TOOL_TYPE = "custom";

const PREAMBLE = [
    "You are standing in for the Claude API in a test harness. Everything below is one API request.",
    "Answer exactly as the model described in the system prompt would answer this request.",
    "Do not use your own browsing, search or other tools: the only tools available are the ones listed",
    "in this request, and only through the reply format described under HOW TO REPLY."
].join("\n");

const TOOL_REPLY_INSTRUCTIONS = [
    "To call one or more tools, include one fenced block per call, exactly like this:",
    "",
    `${FENCE}tool_call`,
    '{"name": "<tool name>", "input": { ... }}',
    FENCE,
    "",
    "Text outside the blocks is kept as your visible reasoning. The system runs the tools and sends",
    "their results back in a follow-up message. If you do not need a tool, reply with plain text only",
    "and the turn ends.",
    "",
    "Only call tools listed under TOOLS. Tools marked (deferred) can only be called after search_tools",
    "has returned them in this conversation."
].join("\n");

/** True for the no-tools structured-extraction calls (`messages.parse` with `output_config`). */
export function isStructuredRequest(request: MessagesRequest): boolean {
    return request.output_config !== undefined;
}

/**
 * Client tools only. Server tools such as `web_fetch` are executed by
 * Anthropic's API, which the relay cannot do, so they are not offered.
 */
export function callableTools(request: MessagesRequest): ApiTool[] {
    return (request.tools ?? []).filter((tool) => tool.type === undefined || tool.type === CUSTOM_TOOL_TYPE);
}

/**
 * Renders one Messages API request as a single self-contained prompt that can
 * be pasted into a fresh Claude chat.
 */
export function renderPrompt(request: MessagesRequest): string {
    const isStructured = isStructuredRequest(request);
    const sections = [PREAMBLE, section("SYSTEM PROMPT", renderSystem(request.system))];

    if (!isStructured) {
        sections.push(section("TOOLS", renderTools(callableTools(request))));
    }
    sections.push(
        section("HOW TO REPLY", isStructured ? renderStructuredInstructions(request) : TOOL_REPLY_INSTRUCTIONS)
    );
    sections.push(section("CONVERSATION", (request.messages ?? []).map(renderMessage).join("\n\n")));
    sections.push("=== YOUR TURN: reply as the assistant ===");

    return sections.join("\n\n");
}

function section(title: string, body: string): string {
    return `=== ${title} ===\n${body}`;
}

function renderSystem(system: MessagesRequest["system"]): string {
    if (system === undefined) return "(none)";
    if (typeof system === "string") return system;
    return system.map(renderBlock).join("\n\n");
}

function renderTools(tools: ApiTool[]): string {
    if (tools.length === 0) return "(no tools available)";
    return tools.map(renderTool).join("\n\n");
}

function renderTool(tool: ApiTool): string {
    const deferred = tool.defer_loading === true ? " (deferred)" : "";
    return [
        `- name: ${tool.name}${deferred}`,
        `  description: ${tool.description ?? ""}`,
        `  input_schema: ${JSON.stringify(tool.input_schema ?? {})}`
    ].join("\n");
}

function renderStructuredInstructions(request: MessagesRequest): string {
    const schema = request.output_config?.format?.schema ?? {};
    return [
        "Reply with ONLY one JSON object that matches the JSON schema below. No prose before or after it.",
        "",
        JSON.stringify(schema, null, 2)
    ].join("\n");
}

function renderMessage(message: ApiMessage): string {
    const body = typeof message.content === "string" ? message.content : message.content.map(renderBlock).join("\n\n");
    return `--- ${message.role} ---\n${body}`;
}

function renderBlock(block: ContentBlock): string {
    switch (block.type) {
        case "text":
            return String(block.text ?? "");
        case "tool_use":
            return `[tool_call id=${String(block.id)}] ${JSON.stringify({ name: block.name, input: block.input })}`;
        case "tool_result":
            return renderToolResult(block);
        case "tool_reference":
            return `[tool now available: ${String(block.tool_name)}]`;
        default:
            return `[${block.type}] ${JSON.stringify(block)}`;
    }
}

function renderToolResult(block: ContentBlock): string {
    const status = block.is_error === true ? " (error)" : "";
    return `[tool_result for ${String(block.tool_use_id)}${status}]\n${renderToolResultContent(block.content)}`;
}

function renderToolResultContent(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content.map((item) => renderBlock(item as ContentBlock)).join("\n");
}
