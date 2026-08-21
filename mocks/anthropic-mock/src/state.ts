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
 */
export function buildClassification(sourceUrls: string[]): Record<string, unknown> {
    return {
        topic: "TARIFFS_TRADE",
        direction: "INCREASES",
        confidence: 0.82,
        summary: "The post links to an announcement of new steel tariffs.",
        sourceUrls,
        reasoning:
            "The linked article confirms a concrete tariff action, which raises the probability of " +
            "related trade-policy market outcomes."
    };
}
