# Decision pipeline module

`backend/src/modules/desicionPipeline/` (note the misspelled directory — kept
as-is for now). Consumes posts accepted by the ingestion module and enriches
them before classification. Only the **link-enrichment stage** exists today.

## Link enrichment

A post's own text is usually too thin to decide on. When it links out to an
article, press release or executive order, the linked page is the actual
signal — so the pipeline scrapes it and hands the classifier readable markdown
instead of raw HTML.

`tweet.service.ts` exports two functions:

- `extractUrls(text): string[]` — every distinct http(s) URL in the post text,
  with trailing sentence punctuation stripped (`...report.pdf,` →
  `...report.pdf`), de-duplicated, capped at `MAX_URLS_PER_TWEET` (5).
- `parseUrlsToMarkdown(text): Promise<ScrapedLink[]>` — scrapes each of those
  URLs and returns `{ url, markdown }` per page that yielded content. The
  `url` is retained so a downstream `decision_log` row can cite its source.

**Failures never propagate.** Unsafe, unreachable, non-HTML and empty pages are
logged at `warn` through the shared pino logger and dropped from the result. A
post with three links where one is dead still yields two entries; a post with
no usable links yields `[]`, never `null`.

Tunables live in `tweet.constants.ts`.

## The scraper

`backend/src/shared/services/webScraper.ts` — kept in `shared/services/`
rather than inside this module because it is not post-specific;
`docs/projectDefenition/initial_investigation.md` already anticipates scraping
whitehouse.gov and Truth Social through the same path.

`scrapePageAsMarkdown(url)` fetches a page and returns its main content as
markdown, or `null` when there is nothing usable:

1. **SSRF guard first, before any request.** `isScrapableUrl` parses the URL,
   allows only `http:`/`https:`, and rejects `localhost`, `*.local`,
   `*.internal`, loopback, RFC1918, link-local (including the `169.254.169.254`
   cloud metadata endpoint) and IPv6 unique-local/link-local literals. Post
   text is untrusted input and must not be able to aim the backend at internal
   infrastructure.
2. **Bounded fetch.** 10s timeout, max 5 redirects (enough for `t.co` chains),
   5 MB response cap, descriptive `User-Agent`, and only HTTP 200 accepted.
3. **Content-type check.** Anything that is not `text/html` /
   `application/xhtml+xml` returns `null` — a PDF must not be fed to the
   markdown converter.
4. **cheerio extraction.** `NOISE_SELECTORS` (`script`, `style`, `nav`,
   `header`, `footer`, `aside`, `form`, `iframe`, `svg`, …) are removed, then
   `CONTENT_SELECTORS` are tried in priority order (`article`, `main`,
   `[role='main']`, `.post-content`, …) with `body` as the fallback; the first
   one holding actual text wins. Relative `href`/`src` values are rewritten to
   absolute against the page URL so links survive the conversion.
5. **Conversion.** The selected subtree is passed to the existing
   `shared/mappers/htmlToMarkdown.ts` (`node-html-markdown`). cheerio decides
   *what* to convert; `node-html-markdown` does the converting.

The scraper lets axios errors propagate — interpreting them is the caller's
job, per the project rule that error handling belongs with the coordinator.

Scraper tunables live in `webScraper.constants.ts`.

## Not implemented yet

Classification, market matching, and order execution. Nothing in this module
sends orders.
