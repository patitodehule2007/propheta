export const SCRAPE_TIMEOUT_MS = 10_000;
export const SCRAPE_MAX_REDIRECTS = 5;
export const SCRAPE_MAX_CONTENT_BYTES = 5 * 1024 * 1024;
export const SCRAPE_USER_AGENT = "PropethaBot/1.0 (+https://github.com/propheta)";
export const SCRAPE_ACCEPT_HEADER = "text/html,application/xhtml+xml";

export const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

export const ALLOWED_PROTOCOLS = ["http:", "https:"];

/**
 * Hostnames and IP literals that must never be fetched: a tweet is untrusted
 * input and could point the scraper at internal infrastructure (SSRF).
 */
export const BLOCKED_HOST_PATTERNS = [
    /^localhost$/i,
    /\.local$/i,
    /\.internal$/i,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^0\./,
    /^\[?::1\]?$/,
    /^\[?f[cd][0-9a-f]{2}:/i,
    /^\[?fe80:/i
];

/**
 * Removed before conversion: chrome and scripting that would otherwise become
 * markdown noise.
 */
export const NOISE_SELECTORS = [
    "script",
    "style",
    "noscript",
    "template",
    "nav",
    "header",
    "footer",
    "aside",
    "form",
    "iframe",
    "svg",
    "[aria-hidden='true']"
];

/** Tried in order; the first match with text wins, otherwise `body` is used. */
export const CONTENT_SELECTORS = [
    "article",
    "main",
    "[role='main']",
    ".post-content",
    ".article-body",
    ".entry-content",
    "#content"
];

/** Attributes rewritten from relative to absolute against the page URL. */
export const URL_ATTRIBUTES = ["href", "src"];
