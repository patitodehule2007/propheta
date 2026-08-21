import { getCachedPage, setCachedPage } from "../../repositories/redis/scrapedPage.repository";
import { logger } from "../../shared/services/logger";
import { scrapePageAsMarkdown } from "../../shared/services/webScraper";

/**
 * Cache-first wrapper around `scrapePageAsMarkdown`. A cache hit avoids the
 * network entirely; a miss scrapes and writes through. A fetch failure (dead
 * link, 403, timeout) is cached as a negative entry too — on the *first* miss
 * it still throws like `scrapePageAsMarkdown` does, but every mention of that
 * same URL afterwards resolves to a cheap `null` instead of curling again.
 *
 * Redis is a performance layer here, not a source of truth: if it is
 * unreachable, this degrades to a direct (uncached) scrape rather than
 * failing the caller.
 *
 * @param url - absolute http(s) URL to scrape, already validated by the caller
 * @returns the page content as markdown, or null when nothing usable was found
 * @throws {AxiosError} on the first fetch failure for a given URL; cached thereafter
 */
export async function scrapePageCached(url: string): Promise<string | null> {
    try {
        const cached = await getCachedPage(url);
        if (cached !== null) return cached.markdown;
    } catch (err) {
        logger.warn({ err, url }, "Scrape cache read failed, falling back to a direct scrape");
    }

    let markdown: string | null;
    try {
        markdown = await scrapePageAsMarkdown(url);
    } catch (err) {
        await writeCacheEntry(url, null);
        throw err;
    }

    await writeCacheEntry(url, markdown);
    return markdown;
}

async function writeCacheEntry(url: string, markdown: string | null): Promise<void> {
    try {
        await setCachedPage(url, markdown);
    } catch (err) {
        logger.warn({ err, url }, "Scrape cache write failed");
    }
}
