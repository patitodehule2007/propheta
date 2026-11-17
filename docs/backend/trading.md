# Trading module

`backend/src/modules/trading/`. Implements `docs/backend/tradeDecision.md`'s
six gates: turns a classified post (`docs/backend/agent.md`) into a specific
Kalshi ticker and side, or — far more often — into a logged reason for doing
nothing, and supervises the exit of any position that results. Triggered from
`runPostPipeline` in `modules/desicionPipeline/orchestrator.service.ts` after
classification succeeds.

The boundary the whole module is built on: **the model chooses which market
(gate 3); code decides whether, how much, and at what price (gates 1, 2, 4,
5, 6).** No tool available to the model can place, amend or cancel an order.

## Files

| File | Gate | What it does |
| --- | --- | --- |
| `trading.constants.ts` | — | statuses, `RECENT_POSTS_WINDOW_DAYS`, the two selection-agent prompts |
| `trading.schema.ts` | — | `tradeProposalSchema` (zod) — the selection agent's structured output |
| `trading.types.ts` | — | `TradeDecisionInput`, `CandidateQuote` — cross-gate shapes |
| `pricing.ts` | — | derives YES/NO ask from a bids-only book; per-contract fee arithmetic; gate 4's conviction-shrunk edge (`computeEdge`) |
| `quote.service.ts` | — | `getLiveOrCachedQuote` — Redis quote cache with a live-fetch fallback |
| `marketCache.service.ts` | — | refreshes `kalshi_series` / `kalshi_markets` for every whitelisted series (`topic_market_series`) |
| `quotePoller.service.ts` | — | REST-polls order books for every cached open ticker in a whitelisted series into the Redis quote cache |
| `preGate.service.ts` | 1 | topic/direction/confidence/novelty/kill-switch/order-rate, zero tokens |
| `candidates.service.ts` | 2 | topic → cached open markets, enriched with derived quotes |
| `selectionAgent.service.ts` | 3 | the only LLM call — two-phase, tighter budget than the classifier; prompt carries the topic's world brief and the author's earlier same-topic posts |
| `riskGate.service.ts` | 4 | whitelist, recomputed edge, §6.3 limits, sizing |
| `exitPolicy.service.ts` | 4 | ATR estimator, geometric horizon blend, stop, gain top (pure functions) |
| `execution.service.ts` | 5 | mints `client_order_id`, persists order + position, `DRY_RUN` branch |
| `exitSupervisor.service.ts` | 6 | evaluates every open position each sweep, closes on the first trigger |
| `tradeDecision.service.ts` | — | sequences gates 1-5; gate 6 runs on its own interval |

## The six gates

```
AGENT_ANALYSIS / CLASSIFIED
   |
1. PRE-GATE               preGate.service.ts           deterministic, 0 tokens
   |
2. CANDIDATE ASSEMBLY      candidates.service.ts        deterministic, cache read
   |
3. SELECTION AGENT         selectionAgent.service.ts    the only LLM call
   |
4. RISK VALIDATION         riskGate.service.ts +        deterministic, authoritative
   & EXIT POLICY           exitPolicy.service.ts
   |
5. EXECUTION               execution.service.ts         DRY_RUN branch here
   |
6. EXIT SUPERVISION        exitSupervisor.service.ts     runs on its own sweep interval
```

Every gate that ends the flow writes its own `decision_log` row — per
`docs/projectDefenition/initial_investigation.md` §7.2, the log of trades
*not* taken is as valuable as the log of trades taken. A gate that passes
writes nothing itself; the eventual outcome (`PROPOSED`/`NO_TRADE` from gate
3, `REJECTED` from gate 4, `ORDER_PLACED`/`ORDER_SIMULATED` from gate 5) is
what appears under `TRADE_DECISION` / `RISK_VALIDATION` / `ORDER`.

### 1. Pre-gate — `preGate.service.ts`

Reads only the classification `agent.service.ts` already produced, plus two
cheap DB reads. In order: topic `NONE` → `topic_not_tradable`; direction
`UNCLEAR` → `direction_unclear`; confidence below `TRADE_MIN_CONFIDENCE` →
`low_confidence`; **novelty** (below) → `no_novelty`; daily-loss kill switch
→ `kill_switch`; orders-per-minute guard → `order_rate_limit`. Any veto here
costs zero LLM tokens.

**Novelty heuristic (v1).** Same author, same topic, same direction within
`TRADE_NOVELTY_WINDOW_HOURS`, read from `decision_log` via
`get_recent_classifications_by_handle`. A hand-rolled heuristic, not the
embedding-based detector §4.3 describes — logged under its own reason
(`no_novelty`) precisely so an embedding version can later be graded against
it (open decision 3 in `tradeDecision.md`).

### 2. Candidate assembly — `candidates.service.ts`

Topic → hand-picked series whitelist (`topic_market_series`) → cached open
markets (`get_candidate_markets_by_topic`), never a live Kalshi call. Two distinct
`NO_TRADE` reasons distinguish "nothing exists" from "something exists but
is too illiquid": the function is called once with no volume floor
(`no_open_market` if that comes back empty) and once with
`TRADE_MIN_SERIES_VOLUME` applied (`no_liquid_market` if that one is empty
instead).

Ranking: markets in the classifier's `targetSeries` come first, then by 24h
volume, before the `TRADE_MAX_CANDIDATES` cap. Without it a topic with many
series (16 under `TARIFFS_TRADE`) let a busy unrelated series push the market
the post is about out of the list. Unknown tickers in `targetSeries` simply
match nothing.

After the quote read, markets with no ask on either side are dropped: they
cannot be bought at any price and only cost the selection agent a call. If
none are left, the outcome is `no_liquid_market`. The cap is applied before
this filter, so an unquoted market still takes one of the slots.

"Open" means a stored status of `active` and a `close_time` still in the
future. Kalshi filters with `status=open` but returns `"status": "active"`
on the market itself (`KALSHI_MARKET_STATUS` in `modules/kalshi`), and the
cache only re-reads markets Kalshi still lists as open, so a market that
closed after its last refresh keeps its `active` row. The backend therefore
passes both the status and the current time to `get_candidate_markets_by_topic`,
`get_open_market_tickers` (quote poller) and `search_kalshi_markets`
(`find_markets`). Series volume is read from Kalshi's `volume_fp`.

Markets must also close within the topic's window: `topic_market_map`'s
`max_close_horizon_minutes` when set, else `TRADE_HORIZON_MINUTES`. Tariff,
appointment and other political markets settle months out and would never
fit a 3-day window; exits are timed by the exit policy regardless of how far
out the market closes.

Every surviving candidate is enriched with the numbers the model must never
derive itself: `yesAsk` / `noAsk` (Kalshi publishes bids only — see
`pricing.ts`), `spreadCents`, `topOfBookContracts`, `feePerContractAtAsk`
(from the series' own `fee_type` / `fee_multiplier`; the multiplier scales
the 0.07 base taker rate, so `1` is the standard schedule), and
`moveSinceSignalCents` (current ask vs. the ask recorded in the Redis quote
cache at the post's `receivedAt` — this is why the quote poller has to be
running continuously, not queried on demand: by the time gate 2 runs, the
pre-signal price no longer exists anywhere else).

### 3. Selection agent — `selectionAgent.service.ts`

Same two-phase shape as `agent.service.ts` (`docs/backend/agent.md`), for the
same reason: a turn that must both call tools and emit strict JSON is
fragile, so Phase A (tool loop, `SELECTION_SYSTEM_PROMPT`) and Phase B
(structured output, same system prompt, tools and `tool_choice`,
`PROPOSAL_INSTRUCTIONS` as the final user message) stay separate calls. Budget is
tighter than the classifier's: `SELECTION_MAX_ITERATIONS` (2) vs. the
classifier's `AGENT_MAX_ITERATIONS` (6) — rules-reading is one or two tool
calls, and needing more means the candidate set was wrong.

The user turn (built by `buildUserPrompt`) carries the post, the
classification, the JSON candidate table, and a `<risk_envelope>` block
mirroring gate 4's own thresholds — a hint so the model doesn't spend a
proposal on something guaranteed to be vetoed. Gate 4 re-checks everything
regardless of what the model was told.

Output is validated against `tradeProposalSchema` (`trading.schema.ts`) via
`zodOutputFormat` — the same mechanism `postClassificationSchema` uses. A
schema mismatch or an exhausted loop is caught and logged as `TRADE_DECISION`
/ `NO_TRADE` with `reason: DiscardReason.AGENT_ERROR`, mirroring the
classifier's own failure path.

Both the classification agent and this one read from the **same**
`toolRegistry` in `modules/agent/agent.tools.ts` — see that doc's "Market
tools" section.

### 4. Risk validation and exit policy — `riskGate.service.ts` + `exitPolicy.service.ts`

Only runs when the model proposed `BUY`. In order: whitelist (the ticker must
be one of gate 2's own candidates, still `open`) → recompute the edge against
a **freshly re-fetched** quote (the LLM call took seconds; the candidate's
own quote can be stale) → spread limit → slippage limit → recomputed fee vs.
`entryFee + expectedExitFee + MIN_NET_EDGE_CENTS`, with the model's edge
first shrunk by conviction (`TRADE_EDGE_SHRINKAGE`, see
`docs/backend/tradeDecision.md` §"Risk profiles") → topic exposure cap →
per-trade exposure cap, clamped by top-of-book depth. Any failure vetoes with
a `VetoReason` and a `RISK_VALIDATION` / `REJECTED` row.

Daily-loss and order-rate are **not** re-checked here — gate 1 already
enforces them, cheaper, before the LLM call was ever spent.

The exit policy (deadline, stop, gain top) is computed here too
(`exitPolicy.service.ts`, pure functions, no I/O except reading quote
samples for the ATR estimator):

- **Horizon**: `computeDeterministicHorizon` tries `ATR` (Wilder ATR over
  Redis quote-cache bars, `edgeCents / velocity` — time is distance over
  speed) and falls through to `TOPIC_TABLE` (`topic_market_map`'s
  `default_horizon_minutes`) when fewer than `EXIT_ATR_MIN_BARS` bars exist
  or velocity rounds to zero. `SURVIVAL` (estimator C) is not implemented —
  selecting it also falls through to `TOPIC_TABLE`. The model's own
  `horizonMinutes` is blended in geometrically
  (`blendHorizonMinutes`, weighted by `EXIT_HORIZON_MODEL_WEIGHT`, default
  `0` = deterministic only), then clamped to
  `[EXIT_HORIZON_MIN_MINUTES, EXIT_HORIZON_MAX_MINUTES]` and, unconditionally,
  to leave `EXIT_CLOSE_BUFFER_MINUTES` before the market closes. If that
  clamp drives the horizon below the floor, `execution.service.ts` vetoes as
  `VetoReason.CLOSING_TOO_SOON` rather than opening a position it can't
  manage.
- **Stop**: `computeStopPolicy` — ATR-scaled distance, clamped to
  `[EXIT_STOP_LOSS_MIN_CENTS, EXIT_STOP_LOSS_MAX_CENTS]`; when ATR is
  unavailable the floor distance is used as a conservative default. `null`
  when the resulting price would be below 1c (the stop cannot bind — the
  position is then governed by the deadline alone).
- **Target**: `computeTargetPriceCents` — `entry + EXIT_TAKE_PROFIT_EDGE_FRACTION
  × edge`, floored by the round-trip fee cost plus `EXIT_TAKE_PROFIT_MIN_NET_CENTS`
  so a "win" never books a net loss.

Both are evaluated later against the **held-side bid**, never the ask.

### 5. Execution — `execution.service.ts`

`client_order_id` (`randomUUID()`) is minted and the order + position rows
are persisted **before** anything (outside dry-run) goes over the wire —
`insert_order` dedups on that id, so a retried call after a network timeout
returns no row rather than a duplicate position.

`config.dryRun` (`DRY_RUN`, default `true`) branches here: dry-run marks the
order `SIMULATED` and opens the position immediately; live mode calls
`kalshiService.createOrder` and treats a **409** (duplicate `client_order_id`)
as idempotent success, per §5.5. Any other failure marks the order `FAILED`
and writes `ORDER` / `ORDER_FAILED` — no position is opened.

**v1 simplification, documented, not silent**: there is no fills feed yet
(§5.6 is phase two), so a successful submission is assumed to fill at the
limit price sent. A partial or delayed fill is not reconciled.

### 6. Exit supervision — `exitSupervisor.service.ts`

Runs on `EXIT_SWEEP_INTERVAL_MS` (default 5000ms), independent of the gate
1-5 sequence — it evaluates **every** open position on every tick, not just
ones past their deadline. Precedence when several triggers land on the same
tick: `EXIT_MARKET_CLOSE` > `EXIT_STOP_LOSS` > `EXIT_TAKE_PROFIT` >
`EXIT_TIME_LIMIT` — capital preservation first, and a fixed order means the
log never needs interpreting.

Live exits (`!isDryRun`) attempt a closing order first and only close the DB
row on success — **open decision 8 in `tradeDecision.md`**: the closing
order uses the opposite book side of the entry, priced through the bid by
`EXIT_SLIPPAGE_CENTS`. That exact mapping is flagged in the design doc as
needing confirmation against a live account before `DRY_RUN=false` is ever
used for real capital; a failed submission logs `EXIT_FAILED` and retries
next sweep rather than closing the position record.

## Quote feed: REST polling, not WebSocket

`docs/backend/tradeDecision.md` recommends a WebSocket feed (§5.6) for
production; this implementation uses REST polling
(`quotePoller.service.ts` → `kalshiService.getMarketOrderbooks`, batched up
to 100 tickers per call) for v1. Tickers go out as repeated query params
(`tickers=A&tickers=B`, set once on the axios client via `paramsSerializer`);
Kalshi reads a comma-joined value as a single ticker and rejects it.
The watch list (`get_open_market_tickers`) covers only whitelisted series,
capped at 500 tickers by 24h volume; a market outside it falls back to a live
order-book read (`getLiveOrCachedQuote`). Consequence: price-triggered exits fire on
`QUOTE_POLL_INTERVAL_MS` cadence, not on a tick. The WebSocket path is a
documented follow-up, not an oversight.

`repositories/redis/marketQuote.repository.ts` holds the samples — a sorted
set per ticker, scored by epoch ms, trimmed to
`QUOTE_SAMPLE_TTL_SECONDS`. Degrades silently (warn-logged) on a Redis
failure, same posture as `scrapedPage.repository.ts`.

Both the quote poller and the market cache refresh no-op (single warn) when
Kalshi credentials are not configured, the same dev-tolerant pattern
`config.anthropic.apiKey` uses.

The market cache refresh walks the whitelist one series at a time
(`GET /series/{ticker}?include_volume=true`, then that series' open markets
— about 80 series, under a minute). A series that fails (delisted, renamed,
rate-limited) is error-logged and skipped; the rest still refresh. Without
`include_volume` Kalshi omits `volume_fp`, which would read as zero volume
and fail every series the liquidity floor.

## Schema

`database/init/migrations/20260904000001_create_trading_tables.ts`:
`topic_market_map`, `kalshi_series`, `kalshi_markets`, `trade_proposals`,
`orders`, `positions`. Money is integer cents; probabilities are `numeric`;
Kalshi contract counts (`kalshi_series.volume`, `kalshi_markets.volume_24h` /
`open_interest`) are `numeric` because fixed-point counts can be fractional
(`20261009000001_kalshi_fractional_counts.ts`);
`20261023000001_topic_market_series_whitelist.ts` replaced
`topic_market_map.kalshi_tags` with the `topic_market_series` join table (one
row per topic × series ticker; no foreign key to `kalshi_series`, which the
whitelist is seeded before) and added `max_close_horizon_minutes`;
no PG enums — categorical columns are `text`, matching the rest of the
schema. `positions` carries `peak_favourable_cents`, `opened_at`,
`closed_at`, `exit_reason` from its first migration specifically so
estimator C (`SURVIVAL`) has history to mine later without a backfill.

`database/init/sql/functions/trading/` — one atomic function per operation
(`CREATE FUNCTION`, `LANGUAGE sql`, no `EXCEPTION` blocks), following the
house style in `sql/functions/ingestion/`. `get_positions_due_for_exit` and
`get_open_positions` return rows only; precedence and P&L arithmetic live in
`exitSupervisor.service.ts`, per the no-business-logic-in-the-database rule.

`database/init/sql/seed/trading_topic_map.sql` — the hand-written topic
table (open decision 4: human-reviewed, never generated): estimator B's
`default_horizon_minutes` and gate 2's `max_close_horizon_minutes` (180 days
for political topics, `NULL` — the global window — for
`MONETARY_POLICY_FED`). Upserts (`ON CONFLICT (topic) DO UPDATE`), so `seed`
refreshes existing rows; `seed-if-empty` still skips a populated DB.

`database/init/sql/seed/trading_topic_series.sql` — the hand-picked topic →
series whitelist that decides which markets a topic can trade. Kalshi tags
were used until 23/10/26 and proved too coarse: one tag spans hundreds of
series, so ranking by volume let off-topic markets (TSA counts, mention
markets) fill the candidate cap ahead of every relevant one. Series were
picked by keyword from series titles (`getSeriesList` per tag,
`getTagsByCategories` for the vocabulary) and reviewed by hand; a series
may serve several topics. Recurring series with no open market right now
stay listed — the refresh picks them up when Kalshi reopens them. The file
deletes and reinserts the whole list, so removing a line removes the
series. Series dropped from the list stay in the cache but are no longer
refreshed, polled or offered as candidates.

## Configuration

All in `config.trading` (`backend/src/config/index.ts`):

| Var | Default | Purpose |
| --- | --- | --- |
| `TRADE_RISK_PROFILE` | `BALANCED` | `CONSERVATIVE` / `BALANCED` / `AGGRESSIVE` preset for the four appetite vars below marked *profile*. |
| `TRADE_MIN_CONFIDENCE` | *profile* (`0.6`) | Gate 1 floor. |
| `TRADE_EDGE_SHRINKAGE` | *profile* (`0.5`) | Gate 4: how far low conviction shrinks the model's edge (0 = none, 1 = full). |
| `MAX_SPREAD_CENTS` | `4` | Gate 4 spread limit. |
| `MAX_SLIPPAGE_CENTS` | `10` | Gate 4 slippage-since-signal limit. |
| `MIN_NET_EDGE_CENTS` | *profile* (`2`) | Gate 4 edge floor, on top of round-trip fees. |
| `MAX_TRADE_EXPOSURE_PCT` | *profile* (`2`) | Per-trade cap, % of `TRADE_CAPITAL_BASE_CENTS`. |
| `MAX_TOPIC_EXPOSURE_PCT` | `5` | Per-topic cap. |
| `MAX_DAILY_LOSS_PCT` | `5` | Gate 1 kill switch. |
| `MAX_ORDERS_PER_MINUTE` | `3` | Gate 1 loop guard. |
| `SELECTION_MAX_ITERATIONS` | `2` | Gate 3 Phase A budget. |
| `SELECTION_MAX_TOOL_CALLS` | `6` | Gate 3 tool-call budget. |
| `TRADE_NOVELTY_WINDOW_HOURS` | `6` | Gate 1 novelty window. |
| `TRADE_MAX_CANDIDATES` | `10` | Gate 2 cap. |
| `TRADE_MIN_HORIZON_MINUTES` | `5` | Alias of `EXIT_HORIZON_MIN_MINUTES` used at the gate-4 floor check. |
| `TRADE_HORIZON_MINUTES` | `4320` | Gate 2's close-time filter window (3 days). |
| `TRADE_MIN_SERIES_VOLUME` | `100` | Gate 2 liquidity floor. |
| `TRADE_CAPITAL_BASE_CENTS` | `100000` | Capital base for exposure math. A live `GET /portfolio/balance` override is a documented follow-up — dev/tests have no Kalshi credentials to read one from. |
| `TRADE_BALANCE_CACHE_MS` | `60000` | Reserved for that override. |
| `QUOTE_POLL_ENABLED` | `true` | Kill switch for the poller (tests disable it). |
| `QUOTE_POLL_INTERVAL_MS` | `2000` | Poll cadence. |
| `QUOTE_SAMPLE_TTL_SECONDS` | `3600` | Redis quote-history retention. |
| `MARKET_CACHE_REFRESH_MS` | `300000` | `kalshi_series` / `kalshi_markets` refresh cadence. |

`config.trading.exit` — the 16 `EXIT_*` vars from `tradeDecision.md`'s own
table (`EXIT_HORIZON_MODEL_WEIGHT`, `EXIT_HORIZON_SYSTEM`,
`EXIT_HORIZON_MIN_MINUTES`, `EXIT_HORIZON_MAX_MINUTES`,
`EXIT_CLOSE_BUFFER_MINUTES`, `EXIT_ATR_PERIOD`, `EXIT_ATR_BAR_SECONDS`,
`EXIT_ATR_MIN_BARS`, `EXIT_ATR_HORIZON_MULTIPLIER`,
`EXIT_STOP_LOSS_ATR_MULTIPLIER`, `EXIT_STOP_LOSS_MIN_CENTS`,
`EXIT_STOP_LOSS_MAX_CENTS`, `EXIT_TAKE_PROFIT_EDGE_FRACTION`,
`EXIT_TAKE_PROFIT_MIN_NET_CENTS`, `EXIT_SURVIVAL_PERCENTILE`,
`EXIT_SWEEP_INTERVAL_MS`) plus `EXIT_SLIPPAGE_CENTS` (default `5`, open
decision 8's marketable-limit bound). Defaults exactly match the design doc.

## Testing

`mocks/kalshi-mock/` (`docs/backend/kalshi.md`) plus `mocks/anthropic-mock`'s
extension for the selection-agent prompts (distinguished from the classifier
by checking the `system` prompt text, since both share `/v1/messages`).

Tests drive each gate through anthropic-mock's post-text markers
(`docs/backend/agent.md`, "Testing") and kalshi-mock's per-scenario markets
and control endpoints (`docs/backend/kalshi.md`, "Testing"). All in
`tests/jest/src/trading/`:

| File | Gate | Outcomes covered |
| --- | --- | --- |
| `tradeDecision.test.ts` | 1-5 | happy path `ORDER_SIMULATED` with full exit policy; `no_open_market`; `low_confidence` |
| `preGate.test.ts` | 1 | `topic_not_tradable`, `direction_unclear`, `no_novelty` |
| `candidateAssembly.test.ts` | 2 | `no_liquid_market`; `targetSeries` ranks first; markets with no ask dropped |
| `selectionAgent.test.ts` | 3 | model `NO_TRADE` (reason passed through), `agent_error` |
| `riskGate.test.ts` | 4, 5 | `hallucinated_ticker`, `market_not_open` (no ask), `spread_over_limit`, `slippage_over_limit`, `edge_below_cost`, `exposure_cap_trade`, `closing_too_soon` |
| `exitSupervision.test.ts` | 6 | `EXIT_STOP_LOSS`, `EXIT_TAKE_PROFIT`, `EXIT_TIME_LIMIT`, `EXIT_MARKET_CLOSE` |

How the harder cases are reached:

- **Novelty isolation.** The novelty window spans the whole run, so every
  test that must pass gate 1 posts under its own (author, topic, direction)
  — one registry, `Signals` in `tests/jest/src/helpers/tradingFixtures.ts`.
- **Exits.** Each scenario opens a position on its own `KXTEST-*` ticker,
  then moves that ticker's book (`PUT /mock/orderbooks/:ticker`) just past
  the stop or target read from the `ORDER` row, or its close time inside
  `EXIT_CLOSE_BUFFER_MINUTES`. `waitForExitDecision` finds the `EXIT` row
  by `metadata.positionId`, since EXIT rows carry no platform post id.
- **Time limit.** The test stack sets `EXIT_HORIZON_MODEL_WEIGHT=1` and
  `EXIT_HORIZON_MIN_MINUTES=0.05`, so `[[horizon:0.1]]` gives a ~6s
  deadline. Every other test keeps the mocked 180-minute horizon.
- **Slippage.** With the poller off there is no pre-signal price, so the test
  writes two samples straight into `quote:v1:KXTEST-SLIP`: one before the
  signal, one dated in the future so it stays the "latest" quote.

Other test-stack overrides: `MAX_ORDERS_PER_MINUTE=50` (a run opens several
positions within seconds), `TRADE_MIN_SERIES_VOLUME=100`,
`TRADE_MAX_CANDIDATES=20`, `EXIT_SWEEP_INTERVAL_MS=1000`.
`QUOTE_POLL_ENABLED=false` — `getLiveOrCachedQuote`'s per-request fallback
is what tests actually exercise, not the background poller.

**Not covered by integration tests**, and why:

- `kill_switch` and `order_rate_limit` (gate 1): tripping either vetoes every
  later test in the run (for the rest of the day, or the next minute). There
  is no backend unit-test setup to cover them in isolation yet.
- `exposure_cap_topic` (gate 4): needs 4-5 concurrent positions in one topic,
  which uses up most of the free novelty identities.
- `ORDER_PLACED`, `ORDER_FAILED`, the 409 idempotent path and `EXIT_FAILED`
  (gates 5-6): live mode only; the whole test stack runs `DRY_RUN=true`.

## Not implemented yet

The WebSocket quote feed (§5.6). Estimator C (`SURVIVAL`). Fill
reconciliation (partial fills, the `/portfolio/fills` feed). The live
`GET /portfolio/balance` override for `TRADE_CAPITAL_BASE_CENTS`. A manual
kill-switch endpoint reachable from a dashboard (§6.3 requires one; nothing
here exposes it yet — the automatic daily-loss kill switch in gate 1 is not
a substitute). Confirming open decision 8's exit-order book-side mapping
against a live Kalshi account. Gate 4's depth cap reads the wrong side of the
book: `topOfBookContracts` is the best YES *bid* size, but buying YES lifts
the best NO bid (TODO on `deriveQuote` in `pricing.ts`).
