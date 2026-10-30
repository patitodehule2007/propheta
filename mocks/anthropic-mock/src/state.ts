/**
 * Static HTML pages served at GET /fixtures/:name, so the backend's real
 * `parse_url` tool (scraper + cache) has something to fetch during tests —
 * only the LLM call itself is mocked, not the scraping path.
 */
export const FIXTURES: Record<string, string> = {
    "tariffs.html": `<html>
<head><title>New Tariffs Announced</title></head>
<body>
<nav>site nav, stripped by the scraper</nav>
<article>
<h1>Administration Announces New Steel Tariffs</h1>
<p>The administration announced a 25% tariff on steel imports effective immediately, citing national security concerns.</p>
</article>
<footer>site footer, stripped by the scraper</footer>
</body>
</html>`,
    "steel.html": `<html>
<head><title>Steel Industry Statement</title></head>
<body>
<article>
<h1>Steel Industry Reacts To Tariff Announcement</h1>
<p>Domestic steel producers welcomed the new import tariffs, citing years of unfair foreign competition.</p>
</article>
</body>
</html>`
};

/** Classification fields a test can force through post-text markers. */
export interface ClassificationOverrides {
    topic?: string;
    direction?: string;
    confidence?: number;
}

/**
 * Fixed classification returned by the mocked Phase B (structured extraction)
 * call. `sourceUrls` is filled in per-request by the caller with whichever
 * URL appeared in the original post text, since that varies per test.
 *
 * `overrides` let a test drive the pre-gate and candidate-assembly branches
 * deterministically -- see `extractOverrides`.
 */
export function buildClassification(
    sourceUrls: string[],
    overrides: ClassificationOverrides = {}
): Record<string, unknown> {
    return {
        topic: overrides.topic ?? "TARIFFS_TRADE",
        direction: overrides.direction ?? "INCREASES",
        confidence: overrides.confidence ?? 0.82,
        summary: "The post links to an announcement of new steel tariffs.",
        sourceUrls,
        reasoning:
            "The linked article confirms a concrete tariff action, which raises the probability of " +
            "related trade-policy market outcomes."
    };
}

/**
 * Reads test-only markers out of the post text, e.g. `[[topic:IMMIGRATION]]`,
 * `[[direction:UNCLEAR]]` or `[[confidence:0.1]]`, so integration tests can
 * drive a specific classification without a real model call. Never matches
 * real post text.
 */
export function extractOverrides(text: string): ClassificationOverrides {
    const topicMatch = text.match(/\[\[topic:([A-Z_]+)\]\]/);
    const directionMatch = text.match(/\[\[direction:([A-Z_]+)\]\]/);
    const confidenceMatch = text.match(/\[\[confidence:([\d.]+)\]\]/);
    return {
        topic: topicMatch ? topicMatch[1] : undefined,
        direction: directionMatch ? directionMatch[1] : undefined,
        confidence: confidenceMatch ? Number(confidenceMatch[1]) : undefined
    };
}

/** How the mocked selection agent should answer, instead of its default BUY. */
export const SelectionMode = {
    /** A schema-valid NO_TRADE proposal. */
    NO_TRADE: "no_trade",
    /** Phase B output that fails `tradeProposalSchema`, i.e. an agent error. */
    INVALID: "invalid"
} as const;

export type SelectionMode = (typeof SelectionMode)[keyof typeof SelectionMode];

/** Selection-agent fields a test can force through post-text markers. */
export interface SelectionOverrides {
    ticker?: string;
    fairProbability?: number;
    conviction?: number;
    horizonMinutes?: number;
    mode?: SelectionMode;
}

const DEFAULT_FAIR_PROBABILITY = 0.6;
const DEFAULT_CONVICTION = 0.75;
const DEFAULT_HORIZON_MINUTES = 180;
const SELECTION_MODES: readonly string[] = Object.values(SelectionMode);

/**
 * Reads the selection-stage markers out of the post text, which the backend
 * embeds verbatim in the selection prompt's `<post>` block:
 * `[[ticker:KXTEST-SL]]` (propose this ticker, candidate or not),
 * `[[fair:0.44]]`, `[[conviction:0.2]]`, `[[horizon:0.1]]` and
 * `[[selection:no_trade|invalid]]`.
 */
export function extractSelectionOverrides(text: string): SelectionOverrides {
    const tickerMatch = text.match(/\[\[ticker:([A-Z0-9-]+)\]\]/);
    const fairMatch = text.match(/\[\[fair:([\d.]+)\]\]/);
    const convictionMatch = text.match(/\[\[conviction:([\d.]+)\]\]/);
    const horizonMatch = text.match(/\[\[horizon:([\d.]+)\]\]/);
    const modeMatch = text.match(/\[\[selection:([a-z_]+)\]\]/);
    const mode = modeMatch && SELECTION_MODES.includes(modeMatch[1]) ? (modeMatch[1] as SelectionMode) : undefined;
    return {
        ticker: tickerMatch ? tickerMatch[1] : undefined,
        fairProbability: fairMatch ? Number(fairMatch[1]) : undefined,
        conviction: convictionMatch ? Number(convictionMatch[1]) : undefined,
        horizonMinutes: horizonMatch ? Number(horizonMatch[1]) : undefined,
        mode
    };
}

/**
 * Trade proposal returned by the selection agent's mocked Phase B. By default
 * proposes the first candidate ticker it is shown, BUY/YES; `overrides` let a
 * test pick a specific ticker (even a hallucinated one), move the fair value
 * or horizon, or force a NO_TRADE. An empty candidate list never reaches
 * this call at all.
 */
export function buildTradeProposal(
    candidateTickers: string[],
    overrides: SelectionOverrides = {}
): Record<string, unknown> {
    const isForcedNoTrade = overrides.mode === SelectionMode.NO_TRADE;
    const ticker = isForcedNoTrade ? null : (overrides.ticker ?? candidateTickers[0] ?? null);
    const noTradeReason = isForcedNoTrade ? "rules_mismatch" : "no_matching_market";
    return {
        action: ticker ? "BUY" : "NO_TRADE",
        ticker,
        outcomeSide: ticker ? "YES" : null,
        fairProbability: ticker ? (overrides.fairProbability ?? DEFAULT_FAIR_PROBABILITY) : null,
        conviction: overrides.conviction ?? DEFAULT_CONVICTION,
        horizonMinutes: overrides.horizonMinutes ?? DEFAULT_HORIZON_MINUTES,
        noTradeReason: ticker ? null : noTradeReason,
        rejectedCandidates: candidateTickers
            .filter((candidateTicker) => candidateTicker !== ticker)
            .map((candidateTicker) => ({ ticker: candidateTicker, reason: "not_evaluated" })),
        reasoning: ticker
            ? "The post directly matches this market's rules_primary and the ask has not moved yet."
            : "None of the candidates settles on what this post moves.",
        inspectedTickers: ticker ? [ticker] : []
    };
}

/** Phase B output that parses as JSON but fails `tradeProposalSchema`. */
export function buildInvalidTradeProposal(): Record<string, unknown> {
    return { action: "BUY", reasoning: "" };
}
