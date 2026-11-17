import Anthropic from "@anthropic-ai/sdk";

import { config } from "../../config";
import { getRecentClassificationsByHandle } from "../../repositories/postgres/trading.repository";
import { logger } from "../../shared/services/logger";
import { AGENT_MAX_TOKENS, AGENT_MODEL, AGENT_TOOL_CHOICE, WEB_FETCH_TOOL } from "../agent/agent.constants";
import { createMessage } from "../agent/anthropicClient.service";
import { executeRegistryTool, toAnthropicTools } from "../agent/agent.tools";
import { extractStructured } from "../agent/structuredExtraction.service";
import { loadTopicWorldContext, sanitizePromptText } from "../worldContext";
import {
    AUTHOR_RECENT_POST_MAX_CHARS,
    AUTHOR_RECENT_POSTS_IN_PROMPT,
    PROPOSAL_INSTRUCTIONS,
    RECENT_POSTS_WINDOW_DAYS,
    RULES_PRIMARY_PROMPT_MAX_CHARS,
    SELECTION_MAX_ITERATIONS,
    SELECTION_MAX_TOOL_CALLS,
    SELECTION_SYSTEM_PROMPT
} from "./trading.constants";
import { tradeProposalSchema, TradeProposalModelOutput } from "./trading.schema";
import { CandidateQuote, TradeDecisionInput } from "./trading.types";

export type SelectionResult =
    { ok: true; proposal: TradeProposalModelOutput; toolCallCount: number; stopReason: string } | { ok: false };

/** Background blocks rendered ahead of the post; each is empty when there is nothing to show. */
interface PromptContext {
    worldContext: string;
    authorRecentPosts: string;
}

const MS_PER_DAY = 86_400_000;
const SELECTION_STAGE = "selection";

interface ToolLoopResult {
    messages: Anthropic.MessageParam[];
    stopReason: string;
    toolCallCount: number;
}

/**
 * Gate 3, the only LLM call in the pipeline. Same two-phase shape as
 * `modules/agent/agent.service.ts`, over a tighter iteration budget:
 * rules-reading is one or two calls, and anything more means the candidate
 * set was wrong. `docs/backend/tradeDecision.md` §"3. Selection agent".
 */
export async function runSelectionAgent(
    input: TradeDecisionInput,
    candidates: CandidateQuote[]
): Promise<SelectionResult> {
    try {
        const [worldContext, authorRecentPosts] = await Promise.all([
            loadTopicWorldContext(input.classification.topic),
            loadAuthorRecentPosts(input)
        ]);
        // Built once: Phase B must send the exact tools Phase A ran with.
        const tools: Anthropic.Messages.ToolUnion[] = [...toAnthropicTools(), WEB_FETCH_TOOL];
        const userPrompt = buildUserPrompt(input, candidates, { worldContext, authorRecentPosts });
        const loopResult = await runToolLoop(userPrompt, tools);
        const proposal = await extractStructured({
            stage: SELECTION_STAGE,
            system: SELECTION_SYSTEM_PROMPT,
            tools,
            transcript: loopResult.messages,
            instructions: PROPOSAL_INSTRUCTIONS,
            schema: tradeProposalSchema
        });
        return { ok: true, proposal, toolCallCount: loopResult.toolCallCount, stopReason: loopResult.stopReason };
    } catch (err) {
        logger.error({ err, platformPostId: input.post.platformPostId }, "Selection agent failed");
        return { ok: false };
    }
}

async function runToolLoop(userPrompt: string, tools: Anthropic.Messages.ToolUnion[]): Promise<ToolLoopResult> {
    let messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
    let toolCallCount = 0;

    for (let iteration = 0; iteration < SELECTION_MAX_ITERATIONS; iteration++) {
        const response = await createMessage(
            { label: `${SELECTION_STAGE}.phaseA`, iteration },
            {
                model: AGENT_MODEL,
                max_tokens: AGENT_MAX_TOKENS,
                system: SELECTION_SYSTEM_PROMPT,
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
            return { messages, stopReason: response.stop_reason, toolCallCount };
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of toolUseBlocks) {
            if (toolCallCount >= SELECTION_MAX_TOOL_CALLS) {
                toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: "Tool call budget exhausted for this run.",
                    is_error: true
                });
                continue;
            }
            toolCallCount += 1;
            const inputArgs = (block.input ?? {}) as Record<string, unknown>;
            const result = await executeRegistryTool(block.name, inputArgs);
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
        }

        messages = [...messages, { role: "user", content: toolResults }];
    }

    return { messages, stopReason: "max_iterations", toolCallCount };
}

/**
 * Inlines the settlement question so the model can match rules without a
 * get_market_rules round-trip per candidate; long rules are cut and flagged
 * so the model knows to fetch the full text.
 */
function truncateRules(rulesPrimary: string): { rulesPrimary: string; rulesTruncated: boolean } {
    if (rulesPrimary.length <= RULES_PRIMARY_PROMPT_MAX_CHARS) {
        return { rulesPrimary, rulesTruncated: false };
    }
    return { rulesPrimary: rulesPrimary.slice(0, RULES_PRIMARY_PROMPT_MAX_CHARS), rulesTruncated: true };
}

/**
 * The author's earlier posts on the same topic, so the model can tell an
 * escalation or a reversal from a repeat. Degrades to nothing on a failed
 * read: it is background, not a precondition.
 */
async function loadAuthorRecentPosts(input: TradeDecisionInput): Promise<string> {
    try {
        const since = new Date(Date.now() - RECENT_POSTS_WINDOW_DAYS * MS_PER_DAY).toISOString();
        const recent = await getRecentClassificationsByHandle({
            handle: input.handle,
            topic: input.classification.topic,
            since,
            // One extra row, since the current post may be among the results.
            limit: AUTHOR_RECENT_POSTS_IN_PROMPT + 1
        });
        const earlier = recent
            .filter((entry) => entry.platformPostId !== input.post.platformPostId)
            .slice(0, AUTHOR_RECENT_POSTS_IN_PROMPT);
        if (earlier.length === 0) {
            return "";
        }
        const entries = earlier.map(
            (entry) =>
                `<recent_post posted_at="${entry.createdAt}" direction="${entry.direction}">\n` +
                `${sanitizePromptText(entry.rawText).slice(0, AUTHOR_RECENT_POST_MAX_CHARS)}\n</recent_post>`
        );
        return ["<author_recent_posts>", ...entries, "</author_recent_posts>"].join("\n");
    } catch (err) {
        logger.warn({ err, platformPostId: input.post.platformPostId }, "Recent posts read failed, continuing without");
        return "";
    }
}

function buildUserPrompt(input: TradeDecisionInput, candidates: CandidateQuote[], context: PromptContext): string {
    const { post, handle, classification } = input;
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(post.receivedAt).getTime()) / 1000));

    const candidateTable = candidates.map((candidate) => ({
        ticker: candidate.ticker,
        seriesTicker: candidate.seriesTicker,
        title: candidate.title,
        yesSubTitle: candidate.yesSubTitle,
        ...truncateRules(candidate.rulesPrimary),
        closeTime: candidate.closeTime,
        yesAsk: candidate.yesAsk,
        noAsk: candidate.noAsk,
        spreadCents: candidate.spreadCents,
        topOfBookContracts: candidate.topOfBookContracts,
        volume24h: candidate.volume24h,
        feePerContractAtAsk: candidate.feePerContractAtAsk,
        moveSinceSignalCents: candidate.moveSinceSignalCents
    }));

    // Background first, the post after it: the post is what is being judged.
    const contextLines = [context.worldContext, context.authorRecentPosts].flatMap((block) =>
        block ? [block, ""] : []
    );

    return [
        ...contextLines,
        "A monitored account just posted. The classification stage has already run.",
        "",
        `<post author="@${handle}" posted_at="${post.receivedAt}" elapsed_seconds="${elapsedSeconds}">`,
        post.rawText,
        "</post>",
        "",
        "<classification>",
        `topic: ${classification.topic}   direction: ${classification.direction}   confidence: ${classification.confidence}`,
        `target event: ${classification.targetEvent}`,
        `target series: ${classification.targetSeries.join(", ")}`,
        `summary: ${classification.summary}`,
        `sources read: ${classification.sourceUrls.join(", ")}`,
        "</classification>",
        "",
        "<candidate_markets>",
        JSON.stringify(candidateTable),
        "</candidate_markets>",
        "",
        "<risk_envelope>",
        // Values match gate 4's own checks -- a hint so the model does not
        // spend a proposal on something guaranteed to be vetoed downstream.
        // Gate 4 re-checks all of it regardless of what the model was told.
        `max spread: ${config.trading.maxSpreadCents}c   max move since signal: ${config.trading.maxSlippageCents}c   ` +
            `min horizon: ${config.trading.exit.horizonMinMinutes} minutes`,
        "Proposals outside these are rejected downstream - do not propose them.",
        "</risk_envelope>",
        "",
        "Decide. If none of these markets settles on what this post actually moves, say",
        "NO_TRADE and say which rule failed."
    ].join("\n");
}
