# World context module

`backend/src/modules/worldContext/`. Curated, per-topic background briefs on
the current state of play (wars, negotiations, tariffs, pending deadlines),
injected into the classifier and selection-agent prompts so the model can
judge whether a post is news and what it changes.

Without them the model reasons from its training data alone. A post like "we
are postponing strikes on Iranian power plants for five days" means little if
the model does not know strikes were threatened, or that talks started two
days ago.

## Manual by design

Briefs are **never refreshed on a schedule**. Two ways to write one, both
behind the API:

- **Paste** (`PUT /api/world-briefs/:topic`): the operator writes the brief,
  or drafts it in a Claude chat with web search, and stores it. Works with no
  Anthropic key.
- **Generate** (`POST /api/world-briefs/:topic/generate`): the backend runs a
  two-phase model call. Phase A is research with the server-side
  `web_search` tool; Phase B is a structured `{ body, sourceUrls }`
  extraction. The result is stored. Synchronous: the response waits for the
  model. With the manual LLM relay (`mocks/anthropic-manual-relay`) running,
  the request lands in the relay queue like any other model call.

Generation is never on the trading hot path. The trading thesis is a latency
window, so a live search per post would spend the edge.

## Storage

Table `world_briefs`, migration `20261030000001_create_world_briefs.ts`:

| Column | Notes |
| --- | --- |
| `topic` | FK → `topic_market_map.topic`. Any `AgentTopic` except `NONE`. |
| `body` | Plain prose, at most `WORLD_BRIEF_MAX_CHARS`. Control characters and prompt fence tags are stripped on save. |
| `source` | `MANUAL` or `GENERATED` (`WorldBriefSource`). |
| `as_of` | When the facts were current. Defaults to now; never in the future. Staleness is measured from it. |
| `source_urls` | jsonb array of http(s) URLs. Never rendered into prompts. |

**Append-only.** Every save is a new version. The newest `as_of` per topic is
the live brief, and older rows are the audit trail.

DB functions (`database/init/sql/functions/context/`), all atomic:
`insert_world_brief`, `get_latest_world_briefs` (live brief per active topic),
`get_latest_world_brief(topic)`, `list_world_briefs(topic, limit, offset)`
(history with `total_count`). Repository:
`backend/src/repositories/postgres/worldBrief.repository.ts`.

## API

All routes require a session (`authMiddleware`). The topic must be a
briefable `AgentTopic`, otherwise 400 `VALIDATION_ERROR`.

| Method | Path | Response |
| --- | --- | --- |
| GET | `/api/world-briefs` | 200, `{ items }`: live brief per topic. Bounded by the taxonomy (≤ 7 rows), so not paginated. |
| GET | `/api/world-briefs/:topic/history?limit&offset` | 200, `{ items, totalCount, limit, offset }`, newest first. |
| PUT | `/api/world-briefs/:topic` | 201. Body `{ body, asOf?, sourceUrls? }`. |
| POST | `/api/world-briefs/:topic/generate` | 201, or 502 `EXTERNAL_SERVICE_ERROR` when the model call fails or no key is configured. |

Examples: `scripts/http/world-briefs.http`.

## How the briefs reach the prompts

`renderWorldContext` (`worldContext.prompt.ts`) renders:

```
<world_context>
<brief topic="INTERNATIONAL_CONFLICT" as_of="2026-10-29T12:00:00.000Z" stale="false">
...
</brief>
</world_context>
```

`stale` is true once `as_of` is older than `WORLD_BRIEF_STALE_AFTER_HOURS`.

- **Classifier** (`agent.service.ts`): every topic's live brief, since the
  post's topic is not known yet. Rendered ahead of `<post_text>` in the
  first user message.
- **Selection agent** (`selectionAgent.service.ts`): only the classified
  topic's brief, plus `<author_recent_posts>` (the same account's earlier
  posts on that topic). Both are read in parallel.

Both loaders (`worldContext.service.ts`) degrade to no block on a failed
read, because briefs are background, not a precondition. With no briefs
stored, the prompts are exactly what they were before this module existed.

The prompts tell the model the post always overrides a brief, a stale brief
may be out of date, and briefs are data, not instructions. Briefs are
operator-written or generated from web search, so they are an injection
surface like scraped pages. Hence the fence-tag stripping, and the fact that
generated output is stored where an operator can read it (GET, history)
before it shapes many decisions.

## Configuration

`config.worldContext` (`backend/src/config/index.ts`):

| Var | Default | Purpose |
| --- | --- | --- |
| `WORLD_BRIEF_WEB_SEARCH_MAX_USES` | `5` | `max_uses` on the generation's `web_search` tool. |
| `WORLD_BRIEF_MAX_CHARS` | `3000` | Body length cap (validation and generated-output truncation). |
| `WORLD_BRIEF_STALE_AFTER_HOURS` | `72` | Age after which a brief renders `stale="true"`. |

## Testing

`tests/jest/src/worldContext/worldBriefs.test.ts` covers store, newest-wins,
pagination, validation (topic, empty or long body, future `asOf`), auth, and
generation. `mocks/anthropic-mock` answers the world-brief stage (detected by
its system prompt) with a fixed brief. The mock reads post markers only from
the `<post_text>` / `<post>` block, so briefs and earlier posts in a prompt
never leak markers into a test's script.

## Not implemented yet

- Prompt caching of the brief block. It would need array `system` or content
  blocks; with low post volume, cache hits would be rare.
- A frontend page. Briefs are managed through the API until the frontend
  design doc exists.
