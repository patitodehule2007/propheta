import Anthropic from "@anthropic-ai/sdk";

import { config } from "../../config";
import { DecisionOutcome, DecisionStage, DiscardReason } from "../../shared/core/decisionLog.constants";
import { logger } from "../../shared/services/logger";
import { insertDecisionLog } from "../../repositories/postgres/ingestion.repository";
import { extractUrls } from "../scraping/scrape.service";
import { loadAllTopicsWorldContext } from "../worldContext";
import { executeRegistryTool, toAnthropicTools } from "./agent.tools";
import {
    AGENT_MAX_TOKENS,
    AGENT_MODEL,
    AGENT_SYSTEM_PROMPT,
    AGENT_TOOL_CHOICE,
    CLASSIFICATION_INSTRUCTIONS,
    MAX_AGENT_ITERATIONS,
    MAX_TOOL_CALLS_PER_RUN,
    WEB_FETCH_TOOL
} from "./agent.constants";
import { postClassificationSchema, PostClassification } from "./agent.schema";
import { createMessage } from "./anthropicClient.service";
import { extractStructured } from "./structuredExtraction.service";
import { loadTrackedMarkets } from "./trackedMarkets.service";

export interface AgentPostInput {
    ingestedPostId: string;
    platformPostId: string;
    text: string;
    /** Monitored account's handle, without the leading `@`. */
    handle: string;
    /** When the post was published, ISO 8601 (X's `created_at`). */
    postedAt: string;
}

interface PromptBackground {
    trackedMarkets: string;
    worldContext: string;
}

const CLASSIFIER_STAGE = "classifier";

/**
 * Explicit breakpoint on the background block: it is identical across posts
 * until a brief or the series catalog changes, so posts arriving within the
 * cache TTL read system + tools + background from cache. Top-level automatic
 * caching (see `anthropicClient.service.ts`) covers the per-post tail.
 */
const BACKGROUND_CACHE_CONTROL: Anthropic.CacheControlEphemeral = { type: "ephemeral" };

interface ToolLoopResult {
    messages: Anthropic.MessageParam[];
    stopReason: string;
    toolCallCount: number;
}

/**
 * Runs the full post-ingestion analysis: an agentic tool-calling loop that
 * may read linked pages, then a structured classification of the result.
 * Always writes exactly one `AGENT_ANALYSIS` decision_log row — on success
 * it is `CLASSIFIED` with the classification in metadata, on any failure it
 * is `DISCARDED` with `reason: "agent_error"`. Never throws: this is called
 * fire-and-forget from `orchestrator.service.ts` after a post is enriched.
 *
 * @param post - the ingested post to analyze
 * @returns The classification on success, or `null` when analysis was
 * skipped or failed — the caller's signal to stop the pipeline here.
 */
export async function runPostAnalysis(post: AgentPostInput): Promise<PostClassification | null> {
    if (!config.anthropic.apiKey) {
        logger.warn(
            { platformPostId: post.platformPostId },
            "ANTHROPIC_API_KEY not configured, skipping agent analysis"
        );
        return null;
    }

    try {
        const [trackedMarkets, worldContext] = await Promise.all([loadTrackedMarkets(), loadAllTopicsWorldContext()]);
        // Built once: Phase B must send the exact tools Phase A ran with.
        const tools: Anthropic.Messages.ToolUnion[] = [...toAnthropicTools(), WEB_FETCH_TOOL];
        const userPrompt = buildUserPrompt(post, { trackedMarkets, worldContext }, new Date());
        const loopResult = await runToolLoop(userPrompt, tools);
        const classification = await extractStructured({
            stage: CLASSIFIER_STAGE,
            system: AGENT_SYSTEM_PROMPT,
            tools,
            transcript: loopResult.messages,
            instructions: CLASSIFICATION_INSTRUCTIONS,
            schema: postClassificationSchema
        });

        await insertDecisionLog({
            ingestedPostId: post.ingestedPostId,
            platformPostId: post.platformPostId,
            stage: DecisionStage.AGENT_ANALYSIS,
            decision: DecisionOutcome.CLASSIFIED,
            reason: null,
            metadata: {
                ...classification,
                toolCallCount: loopResult.toolCallCount,
                stopReason: loopResult.stopReason
            }
        });

        return classification;
    } catch (err) {
        logger.error({ err, platformPostId: post.platformPostId }, "Agent post-analysis failed");
        await insertDecisionLog({
            ingestedPostId: post.ingestedPostId,
            platformPostId: post.platformPostId,
            stage: DecisionStage.AGENT_ANALYSIS,
            decision: DecisionOutcome.DISCARDED,
            reason: DiscardReason.AGENT_ERROR,
            metadata: null
        });
        return null;
    }
}

/**
 * Phase A: the tool-calling loop. Stops on `end_turn`, on running out of
 * agent iterations, or on a stop reason that leaves nothing to feed back
 * (`max_tokens`, `refusal`, ...). `pause_turn` (a server tool such as
 * `web_fetch` pausing a long turn) is resumed by re-sending, per the
 * documented manual-loop pattern.
 */
async function runToolLoop(
    userPrompt: Anthropic.TextBlockParam[],
    tools: Anthropic.Messages.ToolUnion[]
): Promise<ToolLoopResult> {
    let messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
    let toolCallCount = 0;

    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
        const response = await createMessage(
            { label: `${CLASSIFIER_STAGE}.phaseA`, iteration },
            {
                model: AGENT_MODEL,
                max_tokens: AGENT_MAX_TOKENS,
                system: AGENT_SYSTEM_PROMPT,
                tools,
                tool_choice: AGENT_TOOL_CHOICE,
                messages
            }
        );

        messages = [...messages, { role: "assistant", content: response.content }];

        if (response.stop_reason === "end_turn") {
            return { messages, stopReason: response.stop_reason, toolCallCount };
        }

        if (response.stop_reason === "pause_turn") {
            continue;
        }

        if (response.stop_reason !== "tool_use") {
            return { messages, stopReason: response.stop_reason ?? "unknown", toolCallCount };
        }

        const toolUseBlocks = response.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
        );
        if (toolUseBlocks.length === 0) {
            // Only server-tool blocks (e.g. web_fetch) in this turn; nothing for
            // us to execute or feed back — the API already resolved them inline.
            return { messages, stopReason: response.stop_reason, toolCallCount };
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of toolUseBlocks) {
            if (toolCallCount >= MAX_TOOL_CALLS_PER_RUN) {
                toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: "Tool call budget exhausted for this run.",
                    is_error: true
                });
                continue;
            }

            toolCallCount += 1;
            const input = (block.input ?? {}) as Record<string, unknown>;
            const result = await executeRegistryTool(block.name, input);
            toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: result
            });
        }

        messages = [...messages, { role: "user", content: toolResults }];
    }

    return { messages, stopReason: "max_iterations", toolCallCount };
}

/**
 * Two text blocks: the background shared by every post (cached, see
 * `BACKGROUND_CACHE_CONTROL`), then the post itself. Background first, the
 * post last: the post is what is being judged and overrides anything the
 * briefs say.
 */
function buildUserPrompt(post: AgentPostInput, background: PromptBackground, now: Date): Anthropic.TextBlockParam[] {
    const backgroundText = [background.trackedMarkets, background.worldContext].filter(Boolean).join("\n\n");
    const postBlock: Anthropic.TextBlockParam = { type: "text", text: buildPostText(post, now) };
    if (!backgroundText) {
        return [postBlock];
    }
    return [{ type: "text", text: backgroundText, cache_control: BACKGROUND_CACHE_CONTROL }, postBlock];
}

function buildPostText(post: AgentPostInput, now: Date): string {
    const urls = extractUrls(post.text);
    const linksLine =
        urls.length > 0 ? `Links found in the post text: ${urls.join(", ")}` : "No links found in the post text.";

    return [
        "A new post from a monitored political account needs to be analyzed.",
        `Current time: ${now.toISOString()}`,
        "",
        `<post author="@${post.handle}" posted_at="${post.postedAt}">`,
        post.text,
        "</post>",
        "",
        linksLine,
        "",
        "Call parse_url if a link materially affects your analysis — an " +
            "article, executive order, or press release. Not every post needs a tool call: a short, " +
            "self-contained statement can be judged from its text alone."
    ].join("\n");
}
