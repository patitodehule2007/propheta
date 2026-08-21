import axios from "axios";
import * as cheerio from "cheerio";
import { toMarkdown } from "../mappers/htmlToMarkdown";
import {
    ALLOWED_PROTOCOLS,
    BLOCKED_HOST_PATTERNS,
    CONTENT_SELECTORS,
    HTML_CONTENT_TYPES,
    NOISE_SELECTORS,
    SCRAPE_ACCEPT_HEADER,
    SCRAPE_MAX_CONTENT_BYTES,
    SCRAPE_MAX_REDIRECTS,
    SCRAPE_TIMEOUT_MS,
    SCRAPE_USER_AGENT,
    URL_ATTRIBUTES
} from "./webScraper.constants";

/**
 * Checks whether a URL is safe to fetch: well-formed, http(s), and not pointing
 * at loopback or private network space.
 * @param url - candidate URL, typically extracted from untrusted user content
 * @returns true when the URL may be requested
 */
export function isScrapableUrl(url: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }

    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) return false;

    return !BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(parsed.hostname));
}

/**
 * Fetches a web page and converts its main content to markdown, stripping
 * navigation, scripts and other page chrome.
 * @param url - absolute http(s) URL of the page to scrape
 * @returns the page content as markdown, or null when the URL is not fetchable,
 * the response is not HTML, or no readable content was found
 * @throws {AxiosError} when the request fails, times out or returns a non-200 status
 */
export async function scrapePageAsMarkdown(url: string): Promise<string | null> {
    if (!isScrapableUrl(url)) return null;

    const response = await axios.get<string>(url, {
        timeout: SCRAPE_TIMEOUT_MS,
        maxRedirects: SCRAPE_MAX_REDIRECTS,
        maxContentLength: SCRAPE_MAX_CONTENT_BYTES,
        responseType: "text",
        headers: { "User-Agent": SCRAPE_USER_AGENT, Accept: SCRAPE_ACCEPT_HEADER },
        validateStatus: (status) => status === 200
    });

    const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
    if (!HTML_CONTENT_TYPES.some((type) => contentType.includes(type))) return null;

    return extractMarkdown(response.data, url);
}

function extractMarkdown(html: string, baseUrl: string): string | null {
    const $ = cheerio.load(html);

    $(NOISE_SELECTORS.join(",")).remove();
    absolutizeUrls($, baseUrl);

    const content = findContentHtml($);
    if (!content) return null;

    const markdown = toMarkdown([content])[0].trim();
    return markdown.length > 0 ? markdown : null;
}

function findContentHtml($: cheerio.CheerioAPI): string | null {
    for (const selector of [...CONTENT_SELECTORS, "body"]) {
        const element = $(selector).first();
        if (element.length > 0 && element.text().trim().length > 0) {
            return element.html();
        }
    }
    return null;
}

function absolutizeUrls($: cheerio.CheerioAPI, baseUrl: string): void {
    for (const attribute of URL_ATTRIBUTES) {
        $(`[${attribute}]`).each((_index, element) => {
            const value = $(element).attr(attribute);
            if (!value) return;

            try {
                $(element).attr(attribute, new URL(value, baseUrl).href);
            } catch {
                $(element).removeAttr(attribute);
            }
        });
    }
}
