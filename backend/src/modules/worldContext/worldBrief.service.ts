import Anthropic from "@anthropic-ai/sdk";

import { config } from "../../config";
import { insertWorldBrief, WorldBrief } from "../../repositories/postgres/worldBrief.repository";
import { ExternalServiceError, ValidationError } from "../../shared/core/errors";
import { logger } from "../../shared/services/logger";
import { AGENT_MAX_TOKENS, AGENT_MODEL, AGENT_TOOL_CHOICE, MAX_AGENT_ITERATIONS } from "../agent/agent.constants";
import { createMessage } from "../agent/anthropicClient.service";
import { extractStructured } from "../agent/structuredExtraction.service";
import {
    BriefableTopic,
    WORLD_BRIEF_EXTRACTION_INSTRUCTIONS,
    WORLD_BRIEF_MAX_CHARS,
    WORLD_BRIEF_MAX_SOURCE_URLS,
    WORLD_BRIEF_SYSTEM_PROMPT,
    WORLD_BRIEF_WEB_SEARCH_TOOL,
    WorldBriefSource
} from "./worldBrief.constants";
import { GeneratedWorldBrief, generatedWorldBriefSchema, ManualWorldBriefInput } from "./worldBrief.schema";
import { sanitizePromptText } from "./worldContext.prompt";

/** Shared by both phases: Phase B must send the exact tools Phase A ran with. */
const WORLD_BRIEF_TOOLS: Anthropic.Messages.ToolUnion[] = [WORLD_BRIEF_WEB_SEARCH_TOOL];
const WORLD_BRIEF_STAGE = "worldBrief";

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
        return await extractStructured({
            stage: WORLD_BRIEF_STAGE,
            system: WORLD_BRIEF_SYSTEM_PROMPT,
            tools: WORLD_BRIEF_TOOLS,
            transcript,
            instructions: WORLD_BRIEF_EXTRACTION_INSTRUCTIONS,
            schema: generatedWorldBriefSchema
        });
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
        const response = await createMessage(
            { label: `${WORLD_BRIEF_STAGE}.phaseA`, iteration },
            {
                model: AGENT_MODEL,
                max_tokens: AGENT_MAX_TOKENS,
                system: WORLD_BRIEF_SYSTEM_PROMPT,
                tools: WORLD_BRIEF_TOOLS,
                tool_choice: AGENT_TOOL_CHOICE,
                messages
            }
        );
        messages = [...messages, { role: "assistant", content: response.content }];
        if (response.stop_reason !== "pause_turn") {
            return messages;
        }
    }
    return messages;
}

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
}
