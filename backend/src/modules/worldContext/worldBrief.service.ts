import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { config } from "../../config";
import { insertWorldBrief, WorldBrief } from "../../repositories/postgres/worldBrief.repository";
import { ExternalServiceError, ValidationError } from "../../shared/core/errors";
import { logger } from "../../shared/services/logger";
import { AGENT_MAX_TOKENS, AGENT_MODEL, MAX_AGENT_ITERATIONS } from "../agent/agent.constants";
import { anthropicClient } from "../agent/anthropicClient.service";
import {
    BriefableTopic,
    WORLD_BRIEF_EXTRACTION_PROMPT,
    WORLD_BRIEF_MAX_CHARS,
    WORLD_BRIEF_MAX_SOURCE_URLS,
    WORLD_BRIEF_SYSTEM_PROMPT,
    WORLD_BRIEF_WEB_SEARCH_TOOL,
    WorldBriefSource
} from "./worldBrief.constants";
import { GeneratedWorldBrief, generatedWorldBriefSchema, ManualWorldBriefInput } from "./worldBrief.schema";
import { sanitizePromptText } from "./worldContext.prompt";

/**
 * Stores a brief written by the operator as a new MANUAL version.
 * @param topic - topic the brief describes
 * @param input - validated request body
 * @returns the stored version
 * @throws {ValidationError} when nothing is left of the body after sanitizing
 */
export async function saveManualBrief(topic: BriefableTopic, input: ManualWorldBriefInput): Promise<WorldBrief> {
    const body = sanitizePromptText(input.body);
    if (body.length === 0) {
        throw new ValidationError("body: brief is empty after removing control characters and markup");
    }
    return insertWorldBrief({
        topic,
        body,
        source: WorldBriefSource.MANUAL,
        asOf: input.asOf ?? new Date().toISOString(),
        sourceUrls: input.sourceUrls ?? []
    });
}

/**
 * Researches a topic with server-side web search and stores the result as a
 * new GENERATED version. Runs only when the operator asks for it.
 * @param topic - topic to research
 * @returns the stored version
 * @throws {ExternalServiceError} when the model call fails or returns no usable brief
 */
export async function generateBrief(topic: BriefableTopic): Promise<WorldBrief> {
    if (!config.anthropic.apiKey) {
        throw new ExternalServiceError("Brief generation is not configured");
    }
    const generated = await researchAndExtract(topic);
    const body = sanitizePromptText(generated.body).slice(0, WORLD_BRIEF_MAX_CHARS);
    if (body.length === 0) {
        throw new ExternalServiceError("Brief generation returned an empty brief");
    }
    return insertWorldBrief({
        topic,
        body,
        source: WorldBriefSource.GENERATED,
        asOf: new Date().toISOString(),
        sourceUrls: generated.sourceUrls.filter(isHttpUrl).slice(0, WORLD_BRIEF_MAX_SOURCE_URLS)
    });
}

async function researchAndExtract(topic: BriefableTopic): Promise<GeneratedWorldBrief> {
    try {
        const transcript = await runResearch(topic);
        return await extractBrief(transcript);
    } catch (err) {
        logger.error({ err, topic }, "World brief generation failed");
        throw new ExternalServiceError("Brief generation failed");
    }
}

/**
 * Phase A. web_search is a server tool, so there are no client tool calls to
 * execute: the loop only resumes `pause_turn`, which the API uses to split a
 * long server-tool turn.
 */
async function runResearch(topic: BriefableTopic): Promise<Anthropic.MessageParam[]> {
    let messages: Anthropic.MessageParam[] = [
        { role: "user", content: `Topic: ${topic}\nToday: ${new Date().toISOString()}\nResearch it now.` }
    ];

    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
        const response = await anthropicClient.messages.create({
            model: AGENT_MODEL,
            max_tokens: AGENT_MAX_TOKENS,
            system: WORLD_BRIEF_SYSTEM_PROMPT,
            tools: [WORLD_BRIEF_WEB_SEARCH_TOOL],
            messages
        });
        messages = [...messages, { role: "assistant", content: response.content }];
        if (response.stop_reason !== "pause_turn") {
            return messages;
        }
    }
    return messages;
}

/** Phase B: one no-tools structured extraction over the research transcript. */
async function extractBrief(transcript: Anthropic.MessageParam[]): Promise<GeneratedWorldBrief> {
    const response = await anthropicClient.messages.parse({
        model: AGENT_MODEL,
        max_tokens: AGENT_MAX_TOKENS,
        system: WORLD_BRIEF_EXTRACTION_PROMPT,
        messages: [...transcript, { role: "user", content: "Write the final brief now." }],
        output_config: { format: zodOutputFormat(generatedWorldBriefSchema) }
    });
    if (!response.parsed_output) {
        throw new Error("World brief response did not parse against the expected schema");
    }
    return response.parsed_output;
}

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
}
