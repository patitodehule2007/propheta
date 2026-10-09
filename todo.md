# TODO — first full pipeline test run

Target run: dev stack (`docker compose up --build`), X still mocked (`x-api-mock`),
real Anthropic API, Kalshi **demo**, `DRY_RUN=true`.

Code for gates 1–6, the market cache, the quote poller and the exit supervisor is
in place (started from `backend/src/index.ts`). What remains is configuration,
credentials and verification against the live APIs.

## Blockers

Without these the pipeline cannot reach gate 3 (selection agent).

- [ ] **Set `ANTHROPIC_API_KEY` in `.env`.** Empty today, so `runPostAnalysis`
      warns and no-ops; the pipeline stops after `LINKS_ENRICHED`.
  - [ ] Configure the billing spending limit first (still "Pendiente" in
        `docs/entregas/entrega-agosto.md`).
- [x] **Set `KALSHI_API_KEY_ID` and `KALSHI_PRIVATE_KEY` (demo account) in `.env`.**
      Empty today, so the market cache and quote poller no-op and gate 2 always
      returns `no_open_market`.
  - [ ] Run the signed `GET /portfolio/balance` smoke test against demo (pending in
        `docs/entregas/entrega-agosto.md`; command in `docs/backend/kalshi.md`).
- [x] **Fix `X_WEBHOOK_TARGET_URL` in `.env`.** Currently the literal `null`, so
      registration stores `"null"` and `/mock/simulate-post` delivers nowhere.
      Set it to `http://backend:5000/api/webhooks/x`.
- [x] **Make posts triggerable in dev.** `x-api-mock` is now published on
      `127.0.0.1:4100`; REST Client requests live in `scripts/http/`.
  - [x] Call `POST /api/webhooks/x/registration` so the mock has a webhook
        (`scripts/http/webhooks.http`).
  - [x] Hit `/mock/simulate-post` (`scripts/http/x-api-mock.http`).
- [x] **Verify the `topic_market_map` tags** in
      `database/init/sql/seed/trading_topic_map.sql` against a live
      `GET /search/tags_by_categories` response (`getTagsByCategories`) on demo.
      Guessed tags such as `"Fed"` or `"Geopolitics"` may match no series, and the
      demo catalogue may differ from production. *As of 2/10/26 this is done, but*
      *we should probably check it thorughly*
- [ ] **Verify `defer_loading` against the real Anthropic API** with one request
      (`docs/backend/agent.md`, "Verification gap"). If rejected, every
      classification fails; the fallback is dropping `deferLoading` in
      `toAnthropicTools()` (`backend/src/modules/agent/agent.tools.ts`).

## Needed for a meaningful run

Without these, the run will most likely end in `NO_TRADE` at every gate.

- [ ] **Warm up the quote poller** for 10+ minutes before posting. ATR needs at
      least `EXIT_ATR_MIN_BARS` (10) bars of `EXIT_ATR_BAR_SECONDS` (60s);
      otherwise the horizon falls back to `TOPIC_TABLE` and
      `moveSinceSignalCents` has no pre-signal price to compare against.
- [ ] **Loosen liquidity limits for the test run, then restore them.** Demo
      books are likely thin; `MAX_SPREAD_CENTS=4` and
      `TRADE_MIN_SERIES_VOLUME=100` will probably produce `no_liquid_market` /
      `spread_over_limit`.
- [ ] **Avoid novelty vetoes.** Same author + topic + direction within
      `TRADE_NOVELTY_WINDOW_HOURS` (6h) returns `no_novelty`. Rotate the three
      seeded accounts or lower the window for the test.
- [ ] **Confirm `ANTHROPIC_MODEL=claude-sonnet-5` resolves** on the real API; the
      mocks never validated it.
- [ ] **Watch gate 6 closely.** Integration tests now cover all four
      dry-run exits against kalshi-mock, but the first dry run is the first
      time simulated exits run against real quotes — check the `EXIT` rows in
      `decision_log`.
  - [x] Add an integration test for exit supervision (stop loss, take profit,
        time limit, market close).
  - [ ] Cover `kill_switch`, `order_rate_limit` and `exposure_cap_topic` (no
        integration test: they poison shared state; needs backend unit tests).

## Non-blockers (documented v1 gaps)

Not required for a dry run; needed before production or live capital.

- [ ] **Unauthenticated webhook admin routes.** `xWebhookRouter`
      (`backend/src/routes/xWebhook.routes.ts`) has no `authMiddleware`, so
      `GET /api/webhooks/x/decisions` exposes the decision log and
      `POST /api/webhooks/x/registration` can be triggered by anyone. Put both
      behind `authMiddleware`; the CRC `GET /` and the delivery `POST /` must
      stay public for X (delivery is protected by the signature check). Update
      the integration tests and `docs/backend/ingestion.md` accordingly.

- [ ] **Kalshi WebSocket feed (§5.6).** v1 uses REST polling, so price-triggered
      exits fire on `QUOTE_POLL_INTERVAL_MS` cadence, not on a tick. Also covers
      order-book deltas, fills and market lifecycle.
- [ ] **Estimator C (`SURVIVAL`)** for the exit horizon. Currently falls through
      to `TOPIC_TABLE`; needs a few hundred closed positions.
- [ ] **Fill reconciliation.** No fills feed; a successful submission is assumed
      to fill fully at the limit price (`/portfolio/fills`, partial fills).
- [ ] **Live balance override** for `TRADE_CAPITAL_BASE_CENTS` via
      `GET /portfolio/balance` (`TRADE_BALANCE_CACHE_MS` is reserved for it).
- [ ] **Manual kill-switch endpoint** reachable from the dashboard (§6.3 requires
      one; the automatic daily-loss kill switch is not a substitute).
- [ ] **Confirm open decision 8** (exit order book-side mapping and
      `EXIT_SLIPPAGE_CENTS`) against a live Kalshi account before
      `DRY_RUN=false`.
- [ ] **§4.3 regex/keyword prefilter** before the classifier LLM call; today every
      ingested post reaches the classifier.
- [ ] **Latency gap.** Classification runs 10–60s against a < 2s budget in
      `initial_investigation.md` §3. Options: move the prefilter forward,
      tighten iteration budgets, faster model / effort settings.
- [ ] **Enrichment runs inline in the webhook request.** Move to
      acknowledge-first + queue (Redis) before pointing at the real X API, which
      retries slow deliveries.
- [ ] **Real X API ingestion.** No X credentials yet; `X_API_BASE_URL` points at
      the mock. The real X API also rejects webhook URLs that include a port.
- [ ] **Embedding-based novelty detection** (open decision 3) to replace the v1
      same-author/topic/direction heuristic.
- [ ] **Kalshi client coverage gaps:** batch order-book depth options, order
      amend/decrease, batched order endpoints, `/account/limits`.
- [ ] **Re-review the topic map against production tags** before enabling real
      trading (separate from the demo check above).
- [ ] **Gate 4 depth cap reads the wrong book side.** `topOfBookContracts` is
      the YES-bid size, but buying YES lifts the NO bid (TODO on `deriveQuote`
      in `backend/src/modules/trading/pricing.ts`).
- [ ] **Doc drift:** `docs/backend/tradeDecision.md`'s "Enforcement" section still
      describes a Redis sorted set + WebSocket ticks; the implementation is a DB
      sweep + REST polling (documented in `docs/backend/trading.md`).
