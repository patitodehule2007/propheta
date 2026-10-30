import {
    getLatestWorldBrief,
    getLatestWorldBriefs,
    WorldBrief
} from "../../repositories/postgres/worldBrief.repository";
import { logger } from "../../shared/services/logger";
import { renderWorldContext } from "./worldContext.prompt";

/**
 * Briefs are background, never a precondition: a failed read degrades to no
 * context rather than failing the post's analysis.
 */
async function loadRendered(load: () => Promise<WorldBrief[]>, context: Record<string, unknown>): Promise<string> {
    try {
        return renderWorldContext(await load(), new Date());
    } catch (err) {
        logger.warn({ err, ...context }, "World brief read failed, continuing without world context");
        return "";
    }
}

/**
 * The `<world_context>` block for the classifier: every topic's live brief,
 * since the post's topic is not known yet.
 * @returns the rendered block, or an empty string when there are no briefs
 */
export function loadAllTopicsWorldContext(): Promise<string> {
    return loadRendered(getLatestWorldBriefs, { scope: "all_topics" });
}

/**
 * The `<world_context>` block for the selection agent: only the classified
 * topic's live brief.
 * @param topic - the post's classified topic
 * @returns the rendered block, or an empty string when the topic has no brief
 */
export function loadTopicWorldContext(topic: string): Promise<string> {
    return loadRendered(
        async () => {
            const brief = await getLatestWorldBrief(topic);
            return brief ? [brief] : [];
        },
        { topic }
    );
}
