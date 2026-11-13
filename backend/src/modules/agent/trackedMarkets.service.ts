import { getTopicSeriesCatalog, TopicSeriesCatalogEntry } from "../../repositories/postgres/trading.repository";
import { logger } from "../../shared/services/logger";
import { sanitizePromptText } from "../worldContext";
import { AgentTopic } from "./agent.constants";

const WHITESPACE_RUN = /\s+/g;
const NO_TRACKED_MARKETS = "(no tracked markets)";

const TRADABLE_TOPICS = Object.values(AgentTopic).filter((topic) => topic !== AgentTopic.NONE);

function toOneLine(text: string): string {
    return sanitizePromptText(text).replace(WHITESPACE_RUN, " ");
}

/**
 * `TICKER: title`, or the bare ticker until the market cache has fetched the
 * series. Titles come from Kalshi: external text, kept to one sanitized line.
 * The ticker is what the classifier copies into `targetSeries`.
 */
function toPromptLine(entry: TopicSeriesCatalogEntry): string {
    const ticker = toOneLine(entry.seriesTicker);
    const title = entry.seriesTitle ? toOneLine(entry.seriesTitle) : "";
    return title ? `${ticker}: ${title}` : ticker;
}

function renderTopic(topic: string, catalog: TopicSeriesCatalogEntry[]): string[] {
    const lines = [...new Set(catalog.filter((entry) => entry.topic === topic).map(toPromptLine))].filter(
        (line) => line.length > 0
    );
    if (lines.length === 0) {
        return [`${topic}: ${NO_TRACKED_MARKETS}`];
    }
    return [`${topic}:`, ...lines.map((line) => `- ${line}`)];
}

/**
 * Renders the `<tracked_markets>` block: for every taxonomy topic, the Kalshi
 * series the trading stage can actually reach, so the classifier judges
 * direction against an event that has a market rather than inventing one, and
 * names the series (`targetSeries`) candidate assembly should rank first.
 * @param catalog - whitelisted series per topic, as read from the database
 * @returns the prompt block, or an empty string when the catalog is empty
 */
export function renderTrackedMarkets(catalog: TopicSeriesCatalogEntry[]): string {
    if (catalog.length === 0) {
        return "";
    }
    return [
        "<tracked_markets>",
        ...TRADABLE_TOPICS.flatMap((topic) => renderTopic(topic, catalog)),
        "</tracked_markets>"
    ].join("\n");
}

/**
 * Loads and renders the `<tracked_markets>` block for the classifier. Like the
 * world briefs it is background, never a precondition: a failed read degrades
 * to no block rather than failing the post's analysis.
 * @returns the rendered block, or an empty string when unavailable
 */
export async function loadTrackedMarkets(): Promise<string> {
    try {
        return renderTrackedMarkets(await getTopicSeriesCatalog());
    } catch (err) {
        logger.warn({ err }, "Topic series catalog read failed, continuing without tracked markets");
        return "";
    }
}
