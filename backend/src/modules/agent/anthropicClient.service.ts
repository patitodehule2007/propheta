import Anthropic from "@anthropic-ai/sdk";
import { ExtractParsedContentFromParams, ParsedMessage } from "@anthropic-ai/sdk/lib/parser";

import { config } from "../../config";
import { logger } from "../../shared/services/logger";

/**
 * Shared Anthropic client. `baseURL` is only set when `ANTHROPIC_BASE_URL` is
 * configured — tests point it at `mocks/anthropic-mock`, the same seam
 * `X_API_BASE_URL` provides for the X API client. Undefined lets the SDK use
 * its own default.
 */
export const anthropicClient = new Anthropic({
    apiKey: config.anthropic.apiKey,
    baseURL: config.anthropic.baseUrl
});

/**
 * Top-level automatic caching: the API places a breakpoint on the last
 * cacheable block, so each tool-loop iteration and the Phase B call read the
 * earlier conversation from cache instead of paying full input price again.
 */
const AUTO_CACHE_CONTROL: Anthropic.CacheControlEphemeral = { type: "ephemeral" };

/** Identifies one Claude call in the usage log. */
export interface LlmCallContext {
    /** Stage and phase, e.g. `classifier.phaseA`. */
    label: string;
    /** Zero-based loop iteration, for tool-loop calls. */
    iteration?: number;
}

/**
 * Sends a Messages API request with automatic caching on and logs its token
 * usage and duration.
 * @param context - label (and iteration) the usage log line is tagged with
 * @param params - the request, without `cache_control`
 * @returns the API response
 */
export async function createMessage(
    context: LlmCallContext,
    params: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> {
    return withUsageLog(context, () =>
        anthropicClient.messages.create({ ...params, cache_control: AUTO_CACHE_CONTROL })
    );
}

/**
 * Structured-output variant of `createMessage` (`messages.parse`).
 * @param context - label the usage log line is tagged with
 * @param params - the request, without `cache_control`
 * @returns the parsed API response
 */
export async function parseMessage<Params extends Anthropic.MessageCreateParamsNonStreaming>(
    context: LlmCallContext,
    params: Params
): Promise<ParsedMessage<ExtractParsedContentFromParams<Params>>> {
    return withUsageLog(context, () =>
        anthropicClient.messages.parse({ ...params, cache_control: AUTO_CACHE_CONTROL })
    );
}

async function withUsageLog<Response extends Anthropic.Message>(
    context: LlmCallContext,
    call: () => Promise<Response>
): Promise<Response> {
    const startedAt = performance.now();
    try {
        const response = await call();
        logUsage(context, response, Math.round(performance.now() - startedAt));
        return response;
    } catch (err) {
        const durationMs = Math.round(performance.now() - startedAt);
        logger.warn({ llmCall: context.label, iteration: context.iteration, durationMs }, "Anthropic API call failed");
        throw err;
    }
}

function logUsage(context: LlmCallContext, response: Anthropic.Message, durationMs: number): void {
    // Optional chaining on purpose: test mocks return a partial usage object.
    const usage: Partial<Anthropic.Usage> = response.usage ?? {};
    logger.info(
        {
            llmCall: context.label,
            iteration: context.iteration,
            model: response.model,
            durationMs,
            stopReason: response.stop_reason,
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
            cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
            cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
            webFetchRequests: usage.server_tool_use?.web_fetch_requests ?? 0,
            webSearchRequests: usage.server_tool_use?.web_search_requests ?? 0
        },
        "Anthropic API call"
    );
}
