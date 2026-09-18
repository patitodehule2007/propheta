import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { config } from "../../config";
import { logger } from "../../shared/services/logger";
import { AGENT_MAX_TOKENS, AGENT_MODEL, WEB_FETCH_TOOL } from "../agent/agent.constants";
import { anthropicClient } from "../agent/anthropicClient.service";
import { executeRegistryTool, toAnthropicTools } from "../agent/agent.tools";
import {
    PROPOSAL_SYSTEM_PROMPT,
    SELECTION_MAX_ITERATIONS,
    SELECTION_MAX_TOOL_CALLS,
    SELECTION_SYSTEM_PROMPT
} from "./trading.constants";
import { tradeProposalSchema, TradeProposalModelOutput } from "./trading.schema";
import { CandidateQuote, TradeDecisionInput } from "./trading.types";

export type SelectionResult =
    { ok: true; proposal: TradeProposalModelOutput; toolCallCount: number; stopReason: string } | { ok: false };

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
        const loopResult = await runToolLoop(buildUserPrompt(input, candidates));
        const proposal = await extractProposal(loopResult.messages);
        return { ok: true, proposal, toolCallCount: loopResult.toolCallCount, stopReason: loopResult.stopReason };
    } catch (err) {
        logger.error({ err, platformPostId: input.post.platformPostId }, "Selection agent failed");
        return { ok: false };
    }
}

async function runToolLoop(userPrompt: string): Promise<ToolLoopResult> {
    const tools: Anthropic.Messages.ToolUnion[] = [...toAnthropicTools(), WEB_FETCH_TOOL];
    let messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
    let toolCallCount = 0;

    for (let iteration = 0; iteration < SELECTION_MAX_ITERATIONS; iteration++) {
        const response = await anthropicClient.messages.create({
            model: AGENT_MODEL,
            max_tokens: AGENT_MAX_TOKENS,
            system: SELECTION_SYSTEM_PROMPT,
            tools,
            messages
        });

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

async function extractProposal(transcript: Anthropic.MessageParam[]): Promise<TradeProposalModelOutput> {
    const response = await anthropicClient.messages.parse({
        model: AGENT_MODEL,
        max_tokens: AGENT_MAX_TOKENS,
        system: PROPOSAL_SYSTEM_PROMPT,
        messages: [...transcript, { role: "user", content: "Produce the structured trade proposal now." }],
        output_config: { format: zodOutputFormat(tradeProposalSchema) }
    });

    if (!response.parsed_output) {
        throw new Error("Trade proposal response did not parse against the expected schema");
    }
    return response.parsed_output;
}

function buildUserPrompt(input: TradeDecisionInput, candidates: CandidateQuote[]): string {
    const { post, handle, classification } = input;
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(post.receivedAt).getTime()) / 1000));

    const candidateTable = candidates.map((candidate) => ({
        ticker: candidate.ticker,
        seriesTicker: candidate.seriesTicker,
        title: candidate.title,
        yesSubTitle: candidate.yesSubTitle,
        closeTime: candidate.closeTime,
        yesAsk: candidate.yesAsk,
        noAsk: candidate.noAsk,
        spreadCents: candidate.spreadCents,
        topOfBookContracts: candidate.topOfBookContracts,
        volume24h: candidate.volume24h,
        feePerContractAtAsk: candidate.feePerContractAtAsk,
        moveSinceSignalCents: candidate.moveSinceSignalCents
    }));

    return [
        "A monitored account just posted. The classification stage has already run.",
        "",
        `<post author="@${handle}" posted_at="${post.receivedAt}" elapsed_seconds="${elapsedSeconds}">`,
        post.rawText,
        "</post>",
        "",
        "<classification>",
        `topic: ${classification.topic}   direction: ${classification.direction}   confidence: ${classification.confidence}`,
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
