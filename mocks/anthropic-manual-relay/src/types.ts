/**
 * The subset of the Messages API request/response shape the relay reads or
 * writes. Kept loose on purpose: unknown block types are rendered as JSON
 * instead of being rejected.
 */
export interface ContentBlock {
    type: string;
    [key: string]: unknown;
}

export interface ApiMessage {
    role: string;
    content: string | ContentBlock[];
}

export interface ApiTool {
    name: string;
    /** Set for server tools (e.g. `web_fetch_20260318`); absent or `custom` for client tools. */
    type?: string;
    description?: string;
    input_schema?: unknown;
    defer_loading?: boolean;
}

export interface MessagesRequest {
    model?: string;
    system?: string | ContentBlock[];
    tools?: ApiTool[];
    messages?: ApiMessage[];
    output_config?: { format?: { schema?: unknown } };
}

export type StopReason = "end_turn" | "tool_use";

export interface AssistantTurn {
    content: ContentBlock[];
    stopReason: StopReason;
}
