import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { AGENT_MAX_TOKENS, AGENT_MODEL } from "./agent.constants";
import { anthropicClient } from "./anthropicClient.service";

/** One Phase B call over a finished Phase A transcript. */
export interface StructuredExtractionRequest<Schema extends z.ZodType> {
    /** Phase A's `system` prompt, unchanged. */
    system: string;
    /** Phase A's `tools` array, unchanged. */
    tools: Anthropic.Messages.ToolUnion[];
    /** The full Phase A transcript, unchanged. */
    transcript: Anthropic.MessageParam[];
    /** What to produce, appended as the final user message. */
    instructions: string;
    /** Shape the response must parse against. */
    schema: Schema;
}

/**
 * Phase B of the two-phase agents: one structured-output call that continues
 * the Phase A conversation.
 *
 * The request is append-only on purpose. Thinking blocks in the transcript are
 * signed against the `system` prompt, the `tools` list and every earlier
 * message; replaying them under a different `system` or `tools` is a 400 on
 * models that enforce preserved thinking. So `system` and `tools` are Phase A's,
 * the stage-specific instructions travel as a new user message, and
 * `tool_choice: none` stops the model from calling a tool instead of answering.
 * Keeping the prefix intact also lets this call read Phase A from the prompt cache.
 *
 * @param request - Phase A's system, tools and transcript plus the extraction instructions and schema
 * @returns the parsed output
 * @throws {Error} when the response does not parse against `schema`
 */
export async function extractStructured<Schema extends z.ZodType>(
    request: StructuredExtractionRequest<Schema>
): Promise<z.infer<Schema>> {
    const response = await anthropicClient.messages.parse({
        model: AGENT_MODEL,
        max_tokens: AGENT_MAX_TOKENS,
        system: request.system,
        tools: request.tools,
        tool_choice: { type: "none" },
        messages: [...request.transcript, { role: "user", content: request.instructions }],
        output_config: { format: zodOutputFormat(request.schema) }
    });

    if (response.parsed_output === null || response.parsed_output === undefined) {
        throw new Error(`Structured extraction did not parse (stop_reason: ${response.stop_reason ?? "unknown"})`);
    }
    return response.parsed_output;
}
