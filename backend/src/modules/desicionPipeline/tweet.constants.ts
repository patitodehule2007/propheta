export const URL_REGEX =
    /https?:\/\/[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/g;

/** Trailing sentence punctuation the URL pattern greedily swallows. */
export const TRAILING_PUNCTUATION_REGEX = /[.,!?;:)\]]+$/;

export const MAX_URLS_PER_TWEET = 5;

/**
 * A link found in a post together with the markdown scraped from it.
 */
export interface ScrapedLink {
    url: string;
    markdown: string;
}
