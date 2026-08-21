import { logger } from "../../shared/services/logger";
import { isScrapableUrl } from "../../shared/services/webScraper";
import { scrapePageCached } from "./scrapeCache.service";
import { MAX_URLS_PER_TWEET, TRAILING_PUNCTUATION_REGEX, URL_REGEX, type ScrapedLink } from "./scrape.constants";

/**
 * Extracts every distinct http(s) URL contained in a post's text.
 * @param text - raw post text
 * @returns de-duplicated URLs, capped at MAX_URLS_PER_TWEET
 */
export function extractUrls(text: string): string[] {
    const matches = text.matchAll(URL_REGEX);
    const urls = new Set<string>();

    for (const match of matches) {
        const url = match[0].replace(TRAILING_PUNCTUATION_REGEX, "");
        if (url.length > 0) urls.add(url);
    }

    return [...urls].slice(0, MAX_URLS_PER_TWEET);
}

/**
 * Scrapes every link in a post and converts each page to markdown.
 * Links that are unsafe, unreachable or not HTML are logged and skipped, so a
 * single dead link never discards the pages that scraped successfully.
 * @param text - raw post text
 * @returns one entry per successfully scraped link; empty when there are none
 */
export async function parseUrlsToMarkdown(text: string): Promise<ScrapedLink[]> {
    const urls = extractUrls(text).filter(isScrapableUrl);
    if (urls.length === 0) return [];

    const results = await Promise.allSettled(urls.map((url) => scrapePageCached(url)));

    return results.reduce<ScrapedLink[]>((scraped, result, index) => {
        const url = urls[index];

        if (result.status === "rejected") {
            logger.warn({ url, reason: String(result.reason) }, "Failed to scrape link from post");
            return scraped;
        }
        if (result.value === null) {
            logger.warn({ url }, "Link produced no readable content");
            return scraped;
        }

        scraped.push({ url, markdown: result.value });
        return scraped;
    }, []);
}
