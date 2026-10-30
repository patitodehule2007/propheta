import { WorldBrief } from "../../repositories/postgres/worldBrief.repository";
import { WORLD_BRIEF_STALE_AFTER_HOURS } from "./worldBrief.constants";

const MS_PER_HOUR = 3_600_000;

// Control characters other than tab and newline: nothing legitimate in
// prose, and a way to smuggle invisible text into a prompt.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// Background text must not be able to close the fence it is rendered inside.
const FENCE_TAG = /<\/?(world_context|brief|author_recent_posts|recent_post)\b[^>]*>/gi;

/**
 * Strips control characters and background fence tags from text embedded in
 * a prompt as background: briefs (before storing and again before rendering)
 * and the author's earlier posts.
 * @param text - raw text
 * @returns text safe to store and embed in a prompt
 */
export function sanitizePromptText(text: string): string {
    return text.replace(CONTROL_CHARS, "").replace(FENCE_TAG, "").trim();
}

function isStale(asOf: string, now: Date): boolean {
    return now.getTime() - new Date(asOf).getTime() > WORLD_BRIEF_STALE_AFTER_HOURS * MS_PER_HOUR;
}

/**
 * Renders briefs as the `<world_context>` block both agents read. Source URLs
 * are left out on purpose: the model needs the facts, not links to chase.
 * @param briefs - briefs to render; an empty list renders nothing
 * @param now - reference time for the staleness flag
 * @returns the prompt block, or an empty string when there is nothing to show
 */
export function renderWorldContext(briefs: WorldBrief[], now: Date): string {
    if (briefs.length === 0) {
        return "";
    }
    const blocks = briefs.map(
        (brief) =>
            `<brief topic="${brief.topic}" as_of="${new Date(brief.asOf).toISOString()}" ` +
            `stale="${isStale(brief.asOf, now)}">\n${sanitizePromptText(brief.body)}\n</brief>`
    );
    return ["<world_context>", ...blocks, "</world_context>"].join("\n");
}
