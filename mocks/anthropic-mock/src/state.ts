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

/**
 * Fixed classification returned by the mocked Phase B (structured extraction)
 * call. `sourceUrls` is filled in per-request by the caller with whichever
 * URL appeared in the original post text, since that varies per test.
 *
 * `overrides.topic`/`overrides.confidence` let a test drive the pre-gate and
 * candidate-assembly branches deterministically -- see `extractOverrides`.
 */
export function buildClassification(
    sourceUrls: string[],
    overrides: { topic?: string; confidence?: number } = {}
): Record<string, unknown> {
    return {
        topic: overrides.topic ?? "TARIFFS_TRADE",
        direction: "INCREASES",
        confidence: overrides.confidence ?? 0.82,
        summary: "The post links to an announcement of new steel tariffs.",
        sourceUrls,
        reasoning:
            "The linked article confirms a concrete tariff action, which raises the probability of " +
            "related trade-policy market outcomes."
    };
}

/**
 * Reads test-only markers out of the post text, e.g. `[[topic:IMMIGRATION]]`
 * or `[[confidence:0.1]]`, so integration tests can drive a specific
 * classification without a real model call. Never matches real post text.
 */
export function extractOverrides(text: string): { topic?: string; confidence?: number } {
    const topicMatch = text.match(/\[\[topic:([A-Z_]+)\]\]/);
    const confidenceMatch = text.match(/\[\[confidence:([\d.]+)\]\]/);
    return {
        topic: topicMatch ? topicMatch[1] : undefined,
        confidence: confidenceMatch ? Number(confidenceMatch[1]) : undefined
    };
}

/**
 * Fixed trade proposal returned by the selection agent's mocked Phase B.
 * Always proposes the first candidate ticker it is shown, BUY/YES -- tests
 * that need a NO_TRADE or a different ticker drive that through the
 * candidate set itself (e.g. an empty candidate list never reaches this
 * call at all).
 */
export function buildTradeProposal(candidateTickers: string[]): Record<string, unknown> {
    const ticker = candidateTickers[0] ?? null;
    return {
        action: ticker ? "BUY" : "NO_TRADE",
        ticker,
        outcomeSide: ticker ? "YES" : null,
        fairProbability: ticker ? 0.6 : null,
        conviction: 0.75,
        horizonMinutes: 180,
        noTradeReason: ticker ? null : "no_matching_market",
        rejectedCandidates: candidateTickers.slice(1).map((candidateTicker) => ({
            ticker: candidateTicker,
            reason: "not_evaluated"
        })),
        reasoning: "The post directly matches this market's rules_primary and the ask has not moved yet.",
        inspectedTickers: ticker ? [ticker] : []
    };
}
