# Agent module

`backend/src/modules/agent/`. Runs after a post is ingested and enriched
(`docs/backend/decisionPipeline.md`): an agentic tool-calling loop that may
read linked pages, followed by a structured classification of the post per
`docs/projectDefenition/initial_investigation.md` §4.2/§4.3/§7.2. This module
only writes a `decision_log` row and never sends an order — a classification
is a proposal for the trading module (`docs/backend/trading.md`) to act on,
not an action itself.

## Trigger

`orchestrator.service.ts`'s `runPostPipeline` calls `runPostAnalysis(...)`
after link enrichment, as part of a fire-and-forget chain the top-level
`runPipeline` never awaits:

```ts
void runPostPipeline(ingestion.post, ingestion.account.handle).catch((err) => {
    logger.error({ err, platformPostId: ingestion.post.platformPostId }, "Post pipeline failed after enrichment");
});
```

X's webhook ack window is far shorter than an agentic loop that may fetch
pages can take, so the HTTP response to X goes out as soon as the post is
enriched; classification (and, if it succeeds, the trade-decision gates) keep
running in the background of the same process. `runPostAnalysis` never
throws and returns the classification on success or `null` on skip/failure —
`runPostPipeline` reads that return value to decide whether to continue into
`runTradeDecision`.

## Two phases

```
Phase A (tools on)          Phase B (no tools)
messages.create() loop  ──▶ messages.parse() + output_config.format
search_tools / parse_url    → PostClassification (zod-validated)
web_fetch (server tool)
```

They are deliberately two separate requests rather than one call that both
calls tools and emits structured JSON: a tool-calling turn that must also
return strict JSON is the fragile combination, and splitting means Phase B is
one small, independently testable call over a transcript that is already in
the prompt cache.

`agent.service.ts`:

- `runToolLoop(postText)` — the manual loop (not the SDK's tool runner: we
  need `defer_loading`, `tool_reference` results, and mixing a server tool
  with client tools under an explicit call budget). Stops on `end_turn`,
  resumes on `pause_turn` (a long server-tool turn), and gives up after
  `AGENT_MAX_ITERATIONS` (env, default 6) or `AGENT_MAX_TOOL_CALLS` (env,
  default 10) — whichever is hit first still proceeds to Phase B with
  whatever transcript exists, tagged with `stopReason` in metadata, rather
  than discarding the run.
- `extractClassification(transcript)` — one no-tools call with
  `output_config: { format: zodOutputFormat(postClassificationSchema) }`
  (`agent.schema.ts`). `response.parsed_output` is validated client-side by
  the SDK against the zod schema; a schema mismatch throws and the run is
  logged as `DISCARDED` / `agent_error`.

## Tool registry — `agent.tools.ts`

Single file, single exported `toolRegistry: ToolRegistryEntry[]`. Adding a
tool means adding one entry here — nothing else changes:

```ts
interface ToolRegistryEntry {
    name: string;
    description: string;
    keywords: string[];       // extra terms search_tools matches against
    deferLoading: boolean;    // see below
    inputSchema: Anthropic.Tool.InputSchema;
    run: (input: Record<string, unknown>) => Promise<ToolRunResult>;
}
```

`toAnthropicTools()` and `executeRegistryTool(name, input)` both derive from
the array — the request builder and the dispatcher never need touching when
a tool is added.

### `search_tools` — the "grep over tools" entry point

Non-deferred (always loaded). Takes a regex `pattern`, matches it
case-insensitively against every other tool's name + description + keywords,
and returns `Anthropic.ToolReferenceBlockParam[]` — `{"type": "tool_reference",
"tool_name": "..."}` blocks. This is the **documented contract for a custom
tool search implementation**
(platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool
→ "Custom tool search implementation"): a `tool_result` containing
`tool_reference` blocks is expanded by the API into full tool definitions,
exactly like the server-side `tool_search_tool_regex_20251119` /
`tool_search_tool_bm25_20251119` variants — we just implement the search
ourselves.

We use the custom route rather than the server-side tool search tool because,
as of this writing, the server-side variants' documented model-compatibility
table does not include `claude-sonnet-5` (this project's model — see
Configuration below). `defer_loading` itself is a plain per-tool request
field, unrelated to that restriction, so it works normally with a custom
search implementation.

The registry has since grown to seven tools (below) without any change to
`search_tools`, `toAnthropicTools()` or `executeRegistryTool()` — exactly the
point of the mechanism.

**Verification gap:** `defer_loading` is confirmed to be a real, unrestricted
field on `Tool` in the installed SDK (`@anthropic-ai/sdk` 0.120.0) — it is
not typed as gated to specific models, and its documented purpose (excluding
a tool's schema from the initial prompt until a `tool_reference` surfaces it)
is a request-shaping detail, not a model capability. What has **not** been
verified is a live call to the real API with `claude-sonnet-5` and
`defer_loading: true` — no credentials were available in the environment
this was built in. `mocks/anthropic-mock` doesn't exercise real API
validation either. Run one real request before depending on this in
production; if the field is ever rejected, dropping `deferLoading` from
`toAnthropicTools()` in `agent.tools.ts` is a one-line change — `search_tools`
still works, it just stops saving context.

### `parse_url` — cached scraping

`deferLoading: true`. Input: `{ url: string }`. Re-runs `isScrapableUrl`
itself (the SSRF guard belongs inside the tool handler, not only on
pre-extracted URLs, because the model is steered by untrusted post text and
could in principle be pushed toward a URL that never went through any
upstream filter), then calls `scrapePageCached`. Never throws into the loop —
a failure becomes a plain string result the model can read and decide to try
`web_fetch` instead.

### `web_fetch` — fallback for what our scraper can't reach

Declared directly in `agent.service.ts` (`WEB_FETCH_TOOL` in
`agent.constants.ts`) as the Anthropic-hosted `web_fetch_20260318` server
tool, not through the registry (it isn't one of our client tools — Anthropic
executes it). **Neither path renders JavaScript** — the official docs state
web fetch "does not support websites dynamically rendered with JavaScript,"
the same limitation `shared/services/webScraper.ts` has. Where they differ:
`web_fetch` reads PDFs (our scraper only accepts `text/html` /
`application/xhtml+xml`) and survives hosts that reject our scraper's user
agent; it also honors `robots.txt`, which our scraper does not. Capped via
`max_uses` (`WEB_FETCH_MAX_USES`, 3) and `max_content_tokens`
(`WEB_FETCH_MAX_CONTENT_TOKENS`, 20 000) so a bad page can't blow the budget.

### Market tools — shared with the selection agent

Five entries added for `docs/backend/trading.md`'s gate 3 (selection agent),
in the same registry rather than a parallel one, per the doc's own
instruction — `search_tools` and `defer_loading` keep working unchanged for
whichever agent is running:

- `get_market_rules` — `{ ticker }` → cached title, `rules_primary`,
  `rules_secondary`, close time, `additional_prohibitions`. Reads
  `get_kalshi_market_by_ticker` (`trading.repository.ts`); never calls Kalshi.
- `get_market_quote` — `{ tickers[] }` (≤ 20) → derived YES/NO ask, spread,
  top-of-book size and fee per contract, per ticker. Reads the latest polled
  sample from the Redis quote cache, falling back to one direct order-book
  read (`getLiveOrCachedQuote`, shared with candidate assembly) when the
  poller hasn't reached that ticker yet.
- `get_price_history` — `{ ticker, sinceMinutes }` → quote samples since then,
  plus `priceAtSignal` and `moveSinceSignalCents` — the "did we arrive late"
  check.
- `find_markets` — `{ tags[]?, seriesTicker?, query? }` → cached open markets
  matching the filter. The escape hatch for when every candidate fails on its
  rules; not for browsing.
- `get_author_recent_posts` — `{ handle, topic, limit? }` → the account's
  classified posts on that topic over the last `RECENT_POSTS_WINDOW_DAYS`
  (30) — novelty context, complementing the pre-gate's own mechanical check.

None of these can size, price or place anything — no order tool and no
`get_balance` are in the registry. Unlike the two tools above, none of these
take a run-context parameter: every value the doc's tool signatures need
(ticker, handle, topic, ...) is something the model is already given in its
own prompt, so plain input arguments were enough — no change to
`ToolRegistryEntry.run`'s signature was needed.

## Scrape cache

Redis-backed, first real consumer of `config.redis` (previously declared but
unused). New files:

- `repositories/redis/redisClient.ts` — one lazy-connect `ioredis` client.
- `repositories/redis/scrapedPage.repository.ts` — `getCachedPage` /
  `setCachedPage`. Key: `scrape:v1:` + sha256 hex of the exact URL string.
  Value: `{ markdown, url, scrapedAt }` JSON — `url` is kept in the value
  purely so a cached entry is human-inspectable (`redis-cli get <key>`)
  without reversing the hash.
- `modules/scraping/scrapeCache.service.ts` — `scrapePageCached(url)`:
  cache read → on miss, call the existing `scrapePageAsMarkdown`
  (`docs/backend/decisionPipeline.md`) → write through. **Negative entries
  matter as much as positive ones**: a fetch failure (dead link, 403,
  timeout) is cached too, so the *first* mention of a bad URL still throws
  like the underlying scraper does, but every later mention of that same URL
  — across any post — resolves to a cheap cached `null` instead of curling
  again. Positive entries use `SCRAPE_CACHE_TTL_SECONDS` (env, default
  21 600 = 6h); negative entries use the shorter
  `SCRAPE_CACHE_NEGATIVE_TTL_SECONDS` (env, default 900 = 15m), so a
  transient failure is retried sooner than a page that scraped cleanly is
  re-fetched.

Redis is a performance layer, not a source of truth: `scrapePageCached`
degrades to a direct, uncached scrape (with a `logger.warn`) if a cache
read or write fails, rather than failing the caller.

`modules/scraping/scrape.service.ts`'s pre-existing `parseUrlsToMarkdown`
(bulk, all URLs in a post) now goes through the same cache, so the two entry
points to the scraper — the agent's per-URL tool and the bulk enrichment
helper — never scrape the same URL twice.

## Classification taxonomy

`agent.constants.ts` — `AgentTopic` (the English translation of
`docs/projectDefenition/initial_investigation.md` §4.2: `TARIFFS_TRADE`,
`APPOINTMENTS_PERSONNEL`, `MONETARY_POLICY_FED`, `INTERNATIONAL_CONFLICT`,
`SHUTDOWN_BUDGET`, `CRYPTO_REGULATION`, `IMMIGRATION`, `NONE`) and
`AgentDirection` (`INCREASES` / `DECREASES` / `UNCLEAR`). Direction is
modelled as movement in the **event's probability**, never a sentiment
score, per §4.3: the same post can raise one market's probability and lower
another's, and an angry tweet is not automatically bearish for anything.

`agent.schema.ts`'s `postClassificationSchema` adds `confidence` (0–1),
`summary`, `sourceUrls` (only URLs actually read via a tool, not every URL
mentioned in the post), and `reasoning`.

## decision_log

Constants in `shared/core/decisionLog.constants.ts`:

| Stage | Written by | Outcomes |
|---|---|---|
| `TWEET_RECEIVED` | `ingestion.service.ts` | `INGESTED`, `DISCARDED` |
| `AGENT_ANALYSIS` | `agent.service.ts` | `CLASSIFIED`, `DISCARDED` |

(The full stage/outcome list — including the five trade-decision stages that
run after this one — lives in `docs/backend/trading.md`.)

`AGENT_ANALYSIS` / `CLASSIFIED` metadata is the full `PostClassification`
plus `toolCallCount` and `stopReason` (`"end_turn"`, `"max_iterations"`, or
whatever non-actionable `stop_reason` the model returned). `AGENT_ANALYSIS`
/ `DISCARDED` (`reason: DiscardReason.AGENT_ERROR`, `"agent_error"`) covers
any exception from the loop or Phase B — an API error, a schema mismatch,
etc. — metadata is null there; diagnostics go to the logger, not to a
client-facing table.

## Prompt injection posture

Scraped page content is attacker-controlled (it comes from whatever the post
links to) and enters the model's context. `AGENT_SYSTEM_PROMPT`
(`agent.constants.ts`) explicitly fences tool output as untrusted data, not
instructions. `parse_url` keeps its own SSRF check regardless of what
upstream filtering already happened. `web_fetch` is capped with `max_uses`.
None of this is a hard guarantee — it's the same posture the project takes
for scraped content generally (`docs/backend/decisionPipeline.md`).

## Configuration

`config.anthropic` (`backend/src/config/index.ts`): `apiKey` (empty string in
development, required otherwise — same dev-tolerant pattern as
`config.xApi`; `runPostAnalysis` no-ops with a `warn` log when empty),
`baseUrl` (only set to repoint the SDK at a mock, e.g. in tests), `model`
(`ANTHROPIC_MODEL`, default `claude-sonnet-5`), `maxTokens`
(`ANTHROPIC_MAX_TOKENS`, default 16000), `maxAgentIterations`
(`AGENT_MAX_ITERATIONS`, default 6), `maxToolCallsPerRun`
(`AGENT_MAX_TOOL_CALLS`, default 10). `config.scrapeCache`: `ttlSeconds`
(`SCRAPE_CACHE_TTL_SECONDS`), `negativeTtlSeconds`
(`SCRAPE_CACHE_NEGATIVE_TTL_SECONDS`).

## Testing

No HTTP interception library exists in this repo (no nock/msw) — the
established pattern is a real containerized mock reached via a base-URL env
override, the same way `X_API_BASE_URL` repoints the X API client at
`mocks/x-api-mock`. `mocks/anthropic-mock/` follows it for `/v1/messages`.

**Manual relay (temporary).** `mocks/anthropic-manual-relay/` uses the same
base-URL override for hand testing without an API key. It holds each
`/v1/messages` call and shows it as one prompt, which a human answers in a
regular Claude chat and posts back (`scripts/http/manual-llm.http`). Enable it
with `docker-compose.manual-llm.yml`. Steps, limits and removal are in its
README.

It is **stateless by design**: every request carries the full conversation
so far, and the script is derived entirely from that request body (how many
assistant turns already happened, whether the original post text contains a
URL, whether `output_config` is present) rather than a server-side counter.
That means concurrent or re-ordered test runs never desync the script. It
also serves `GET /fixtures/:name` — small static HTML pages — so the real
scraper (`webScraper.ts` → `scrapeCache.service.ts`) has something genuine to
fetch and convert; only the LLM call is faked, not the scraping path.

Tests steer the script with markers in the post text, which never match real
posts:

- Classification: `[[topic:X]]`, `[[direction:X]]`, `[[confidence:N]]`.
- Selection agent (gate 3, read from the post embedded in the selection
  prompt): `[[ticker:X]]` (propose this ticker, even one that is not a
  candidate), `[[fair:N]]`, `[[horizon:N]]`, `[[selection:no_trade]]` (a
  schema-valid `NO_TRADE`, reason `rules_mismatch`) and
  `[[selection:invalid]]` (Phase B output that fails `tradeProposalSchema`).

- `tests/jest/src/agent/analysis.test.ts` — a monitored-author post linking
  to a fixture ends up with an `AGENT_ANALYSIS` / `CLASSIFIED` row whose
  metadata matches the mock's scripted classification.
- `tests/jest/src/agent/scrapeCache.test.ts` — connects to `redis-test`
  directly and asserts both a positive cache entry (successful fixture
  fetch) and a negative one (a fetch that 404s) land under the expected
  `scrape:v1:<sha256>` key.
- `tests/jest/src/helpers/xApiMock.ts`'s `waitForDecision` now takes an
  optional `{ stage }` filter: a monitored-author post now produces *two*
  rows (`TWEET_RECEIVED` then `AGENT_ANALYSIS`), and the agent run can finish
  fast enough against the mock to land before an unfiltered poll would catch
  the ingestion row — filtering by stage removes that race instead of hoping
  timing works out.

## Not implemented yet

The §4.3 cheap regex/keyword prefilter *before* this module's own LLM call —
every ingested post currently reaches the classifier; the prefilter would sit
at the top of `runPostAnalysis`. Market matching, risk sizing, order
execution, and a novelty heuristic now exist, but one level up in
`docs/backend/trading.md`'s gates 1-5 — this module's job stays classification
only.

All of those are covered by `docs/backend/tradeDecision.md`, the plan for the
stages that consume a `PostClassification`. It reuses this module's two-phase
shape and `toolRegistry`, so the new market tools land as registry entries
here rather than as a parallel agent.

## Known gap: latency vs. the design doc

`docs/projectDefenition/initial_investigation.md` §3 budgets **< 2s** for
classification. An agentic loop that may fetch pages runs 10–60s in
practice. That number was written before this module existed and is not
reachable by this design — flagged here rather than silently missed; revisit
if latency becomes a real constraint (e.g. move the prefilter forward,
tighten iteration budgets, or accept that the < 2s target only ever applied
to the no-tool-call path).
