import { createHash } from "crypto";

import { config } from "../../config";
import { redisClient } from "./redisClient";

const CACHE_KEY_PREFIX = "scrape:v1:";

interface CachedPage {
    /** null represents a negative cache entry: the page was tried and yielded nothing. */
    markdown: string | null;
    /** Kept alongside the hashed key so a cache entry is human-inspectable. */
    url: string;
    scrapedAt: string;
}

function cacheKey(url: string): string {
    return CACHE_KEY_PREFIX + createHash("sha256").update(url).digest("hex");
}

/**
 * Reads a previously cached scrape result for a URL.
 * @param url - the page URL, exactly as it will be re-scraped
 * @returns the cached entry, or null on a cache miss. Errors propagate to the
 * caller, which decides whether to fall back to a direct scrape.
 */
export async function getCachedPage(url: string): Promise<CachedPage | null> {
    const raw = await redisClient.get(cacheKey(url));
    if (raw === null) return null;
    return JSON.parse(raw) as CachedPage;
}

/**
 * Writes a scrape result to the cache, positive or negative. Negative entries
 * (markdown === null) use a shorter TTL so a transiently dead link is retried
 * sooner than a page that scraped successfully.
 * @param url - the page URL that was scraped
 * @param markdown - the scraped markdown, or null when nothing usable was found
 */
export async function setCachedPage(url: string, markdown: string | null): Promise<void> {
    const entry: CachedPage = { markdown, url, scrapedAt: new Date().toISOString() };
    const ttlSeconds = markdown === null ? config.scrapeCache.negativeTtlSeconds : config.scrapeCache.ttlSeconds;
    await redisClient.set(cacheKey(url), JSON.stringify(entry), "EX", ttlSeconds);
}
