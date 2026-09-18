# Decision pipeline module

`backend/src/modules/desicionPipeline/` (note the misspelled directory — kept
as-is for now). Coordinates the stages a post passes through, from the webhook
delivery to an order (or a logged reason for not placing one).

## The orchestrator

`orchestrator.service.ts` exports `runPipeline(rawBody, signatureHeader, event)`
and is the **single entry point** for a `post.create` delivery.
`controller/xWebhook.controller.ts` calls it, not the ingestion service.

Each stage reports its outcome and the orchestrator decides whether the flow
continues:

1. **TWEET_RECEIVED** — `modules/ingestion/ingestion.service.ts`. Returns an
   `IngestionResult`, a discriminated union of `INGESTED` (carrying the
   persisted post and its monitored account) or `DISCARDED` (carrying the
   reason). A discard stops the pipeline; nothing downstream runs.
2. **LINKS_ENRICHED** — scrapes the links the post carries (below).

After enrichment, `runPipeline` fires `runPostPipeline` **without awaiting
it** and returns — classification (`docs/backend/agent.md`) and, when it
succeeds, the six trade-decision gates (`docs/backend/tradeDecision.md`) run
after the webhook response has already gone back to X. Together they can run
10-60s (see `agent.md`'s "Known gap"), far longer than a webhook response
should block for. Every gate still writes its own `decision_log` row, so the
audit trail is complete even though the HTTP response returned long before it
was.

Stage and decision values are **not string literals at the call site**: they
live in `backend/src/shared/core/decisionLog.constants.ts` (`DecisionStage`,
`DecisionOutcome`, `DiscardReason`, plus the trade-decision reason
vocabularies — `PreGateReason`, `CandidateAssemblyReason`, `NoTradeReason`,
`VetoReason`, `ExitReason`). They sit in `shared/core` rather than in this
module because ingestion, the agent module and the trading module all write
them, and this module already imports ingestion — a module-local home would be
a circular dependency.

## Link enrichment

A post's own text is usually too thin to decide on. When it links out to an
article, press release or executive order, the linked page is the actual
signal — so the pipeline scrapes it and hands the classifier readable markdown
instead of raw HTML.

`modules/scraping/scrape.service.ts` exports two functions:

- `extractUrls(text): string[]` — every distinct http(s) URL in the post text,
  with trailing sentence punctuation stripped (`...report.pdf,` →
  `...report.pdf`), de-duplicated, capped at `MAX_URLS_PER_TWEET` (5). Note the
  pattern requires a dotted host, so `http://localhost:9999/x` is not extracted
  at all.
- `parseUrlsToMarkdown(text): Promise<ScrapedLink[]>` — scrapes each of those
  URLs and returns `{ url, markdown }` per page that yielded content. The
  `url` is retained so the `decision_log` row can cite its source.

**Failures never propagate.** Unsafe, unreachable, non-HTML and empty pages are
logged at `warn` through the shared pino logger and dropped from the result. A
post with three links where one is dead still yields two entries; a post with
no usable links yields `[]`, never `null`.

The orchestrator writes a `LINKS_ENRICHED` row only when the post actually
contained at least one URL — a post with no links produces no enrichment row,
so the audit trail does not fill with empty stages. The row records
`urlsFound`, `urlsScraped` and a `sources` array of `{ url, markdownLength }`.
**The markdown itself is not stored**: it can run to megabytes and
`decision_log` is an audit trail, not a content store. Persisting the scraped
text needs its own table, which lands with the classification stage.

Tunables live in `modules/scraping/scrape.constants.ts`.

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
   _what_ to convert; `node-html-markdown` does the converting.

The scraper lets axios errors propagate — interpreting them is the caller's
job, per the project rule that error handling belongs with the coordinator.

Scraper tunables live in `webScraper.constants.ts`.

## Known limitation: enrichment runs inline

`runPipeline` is awaited inside the webhook request, so the HTTP 200 back to X
is delayed until scraping finishes — bounded by the scraper's 10s timeout
(links are scraped in parallel via `Promise.allSettled`, so 5 links still cost
~10s, not 50s). X expects prompt acknowledgement and retries deliveries that
are slow, so this needs to become fire-and-forget — acknowledge first, then
process off a queue — before the pipeline runs against the real X API. Redis is
already in the stack for it.

## Testing

`tests/jest/src/ingestion/webhook.test.ts` covers the enrichment stage through
the full pipeline: a post carrying a blocked-host URL
(`http://169.254.169.254/latest/meta-data`) must still produce a
`LINKS_ENRICHED` row with `urlsFound: 1, urlsScraped: 0`, proving both that the
stage runs and that the SSRF guard holds end to end. A post with no links must
produce no enrichment row at all.

Because a post now accumulates one `decision_log` row per stage, the
`waitForDecision` helper takes an optional `stage` — without it the most recent
row wins, which is only unambiguous for posts that stop at ingestion.

## What runs after this module

Classification (`docs/backend/agent.md`) and the six trade-decision gates
(`docs/backend/trading.md`) are triggered from `runPostPipeline` in this
module's own orchestrator, fire-and-forget after enrichment. This module
itself still only ingests and enriches — it never sends an order; the wiring
just hands off to the next stage.

## Not implemented yet

The WebSocket quote feed (§5.6) — v1 uses REST polling instead, see
`docs/backend/trading.md`. Estimator C (`SURVIVAL`) for the exit horizon.
Manual kill-switch triggering from a dashboard.
