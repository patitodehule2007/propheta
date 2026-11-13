# Kalshi module

`backend/src/modules/kalshi/`. A transport wrapper over the [Kalshi Trade API
v2](https://docs.kalshi.com/api-reference) REST surface — the venue Propheta
trades on. It signs, sends and types requests; it holds no domain logic. Market
matching, risk validation and the dry-run guard live in the services that call
it.

Nothing HTTP-facing is exposed yet: no routes, no controllers. This is the
seam `docs/backend/trading.md`'s market cache, quote poller and execution
gate all call.

## Files

| File | What it does |
| --- | --- |
| `kalshi.constants.ts` | Header names, signature algorithm, REST path builders. |
| `kalshi.types.ts` | Request/response interfaces mirroring the wire format. |
| `kalshiSigner.service.ts` | Builds the three auth headers (RSA-PSS over SHA-256). |
| `kalshiHttp.service.ts` | Signed axios instance + error mapping. |
| `kalshiClient.service.ts` | One exported function per endpoint. |

## Environment

| Var | Default | Notes |
| --- | --- | --- |
| `KALSHI_API_BASE_URL` | `https://external-api.demo.kalshi.co/trade-api/v2` | The prod/demo switch. |
| `KALSHI_API_KEY_ID` | empty in development, required otherwise | API key id from *Account & security → API Keys*. |
| `KALSHI_PRIVATE_KEY` | empty in development, required otherwise | RSA private key PEM, one line, literal `\n` between lines. |
| `KALSHI_TIMEOUT_MS` | `10000` | Per-request axios timeout. |

Read only through `backend/src/config/`, never `process.env` directly.

### Switching between demo and production

One value changes:

```
# demo
KALSHI_API_BASE_URL=https://external-api.demo.kalshi.co/trade-api/v2
# production
KALSHI_API_BASE_URL=https://external-api.kalshi.com/trade-api/v2
```

Credentials do not cross environments: a demo key only works against demo
hosts. The `/trade-api/v2` suffix is part of the value on purpose — the
signature covers the full path from the API root, so the prefix has to be
there.

In development the stack boots with the credentials unset; the first call then
throws `ExternalServiceError("Kalshi API credentials are not configured")`.
This mirrors `ANTHROPIC_API_KEY` (`docs/backend/agent.md`).

## Authentication

Every request carries three headers:

| Header | Value |
| --- | --- |
| `KALSHI-ACCESS-KEY` | the API key id |
| `KALSHI-ACCESS-TIMESTAMP` | `Date.now()` in milliseconds |
| `KALSHI-ACCESS-SIGNATURE` | base64 RSA-PSS/SHA-256 signature |

The signed message is `timestamp + HTTP_METHOD + path`, where `path` is the
full path from the API root **with the query string stripped and the host
excluded**:

```
1703123456789GET/trade-api/v2/portfolio/balance
```

`kalshiHttp.service.ts` derives that path by concatenating the base URL with
the relative request path and taking `URL.pathname` — `new URL("/x", base)`
cannot be used, because a leading slash would discard the `/trade-api/v2`
prefix.

Public endpoints ignore the headers, so they are attached unconditionally
rather than branching per endpoint. The private key PEM is parsed once and
cached.

## Endpoints

| Function | Method and path |
| --- | --- |
| `getExchangeStatus` | `GET /exchange/status` |
| `getExchangeSchedule` | `GET /exchange/schedule` |
| `getMarkets` | `GET /markets` |
| `getMarket` | `GET /markets/{ticker}` |
| `getMarketOrderbook` | `GET /markets/{ticker}/orderbook` |
| `getTrades` | `GET /markets/trades` |
| `getEvents` | `GET /events` |
| `getEvent` | `GET /events/{event_ticker}` |
| `getBalance` | `GET /portfolio/balance` |
| `getPositions` | `GET /portfolio/positions` |
| `getFills` | `GET /portfolio/fills` |
| `getOrders` | `GET /portfolio/orders` |
| `getOrder` | `GET /portfolio/orders/{order_id}` |
| `createOrder` | `POST /portfolio/events/orders` |
| `cancelOrder` | `DELETE /portfolio/events/orders/{order_id}` |
| `getMarketOrderbooks` | `GET /markets/orderbooks` |
| `getSeriesList` | `GET /series` |
| `getSeries` | `GET /series/{ticker}` |
| `getTagsByCategories` | `GET /search/tags_by_categories` |
| `getSeriesFeeChanges` | `GET /series/fee_changes` |

Writes use the V2 order paths (`/portfolio/events/orders`). The legacy
`/portfolio/orders` write endpoint is deprecated by Kalshi no earlier than
2026-05-06.

`getMarketOrderbooks` is the batch order-book read (up to 100 tickers per
call) the quote poller uses instead of one request per market. Its `tickers`
is a `string[]` sent as repeated params (`tickers=A&tickers=B`, the axios
client's `paramsSerializer`); a comma-joined value is one invalid ticker.
`getSeries` (the market cache's path, with `include_volume: true` — otherwise
Kalshi omits `volume_fp`) and `getSeriesList` carry the `fee_type` /
`fee_multiplier` a series' own market cache row needs — never assume the
default schedule. `fee_multiplier` is a scale on the 0.07 base taker rate
(`1` = standard schedule, `0.5` = half), not the rate itself:
`fee = ceil(0.07 × fee_multiplier × C × P × (1 − P))` (`pricing.ts`). `getSeriesList` and `getTagsByCategories` (not text
search — filter discovery over the real Kalshi tag vocabulary) are used to
review the topic → series whitelist (`docs/backend/trading.md`), never on the
trading critical path.

**Still not covered**: the WebSocket feed (§5.6 — order book deltas, fills,
market lifecycle), `/markets/orderbooks` batch depth options beyond the
default, order amend/decrease, batched order endpoints, and `/account/limits`.

### Pagination

List endpoints are cursor-paginated. `limit` and `cursor` are passed straight
through and the response `cursor` is returned as-is — the wrapper never loops
for the caller. An empty `cursor` means there is no next page.

### Fixed-point values

Prices and contract counts are **strings**, not numbers
(`FixedPointDollars`, `FixedPointCount` in `kalshi.types.ts`): `"0.5600"`,
`"10.00"`. Requests accept 2–4 decimals for dollars and 0–2 for counts;
responses emit up to 6 and exactly 2 respectively. Do not convert to `number`
for money arithmetic.

### Order direction

`book_side` / `outcome_side` are the canonical direction fields. `bid` buys
YES, `ask` sells YES. The legacy `action` / `side` fields are deprecated
upstream and are not typed here.

## Dry run

`createOrder` always reaches the exchange — it does not consult `DRY_RUN`. The
wrapper stays dumb on purpose; the caller in the execution path must check
`config.dryRun` before invoking it.

## Errors

`kalshiHttp.service.ts` catches every axios failure, logs method, path,
status, error code and upstream body through the shared logger, and rethrows
`ExternalServiceError` with a fixed, client-safe message. The centralized
error middleware surfaces `AppError.message` to clients, so the upstream path,
status and payload deliberately stay out of it.

## Testing

`mocks/kalshi-mock/` (Express, following the shape of `mocks/x-api-mock`)
implements the subset of the surface `docs/backend/trading.md` actually calls:
`/series`, `/series/{ticker}`, `/search/tags_by_categories`, `/markets`, `/markets/{ticker}`,
`/markets/{ticker}/orderbook`, `/markets/orderbooks`, and
`POST /portfolio/events/orders` (assumes an immediate full fill — there is no
matching engine — and returns **409 on a repeated `client_order_id`** so the
idempotent-success path is exercised).

Fixtures (`mocks/kalshi-mock/src/state.ts`). Which topics reach each series
is set by `tests/jest/fixtures/trading_topic_series.sql`, which the test
stack mounts over the real whitelist seed, so the test cache only ever
refreshes the mock's series:

| Series | Reached from | Markets |
| --- | --- | --- |
| `KXTARIFF` | `TARIFFS_TRADE` | `KXTARIFF-25-A` (happy path), `KXTARIFF-25-EMPTY` (empty book both sides; gate 2 drops it) |
| `KXTARIFFMEX` | `TARIFFS_TRADE` | `KXTARIFFMEX-26-A`, lowest 24h volume; ranks first only when the classifier names `KXTARIFFMEX` in `targetSeries` |
| `KXTEST` | `MONETARY_POLICY_FED`, `APPOINTMENTS_PERSONNEL`, `INTERNATIONAL_CONFLICT`, `CRYPTO_REGULATION` | one per gate/exit scenario: `-BASE`, `-SL`, `-TP`, `-TL`, `-MC`, `-WIDE` (12c spread), `-THIN` (0.5 contracts at the top), `-NOASK` (no NO bids), `-CLOSING` (closes 20 min after mock start), `-SLIP` |
| `KXLOWVOL` | `SHUTDOWN_BUDGET` | `KXLOWVOL-26-A`, series volume 10 (below the test stack's `TRADE_MIN_SERIES_VOLUME`) |

Like the real API, the mock filters markets with `status=open` but returns
them with `"status": "active"`, reports series volume as `volume_fp`
(a fixed-point string) and only when asked with `include_volume=true`, and
accepts `/markets/orderbooks` tickers as repeated params, so a backend that
compares against the filter value, reads a numeric `volume`, forgets
`include_volume` or comma-joins tickers fails the tests instead of production.

`IMMIGRATION` deliberately resolves to no series (`no_open_market`). When a
test needs a new topic → series pairing, add it to the fixture whitelist and
this table together.

Test-only control endpoints (not part of the real API), used by the
exit-supervision tests:

- `PUT /mock/orderbooks/:ticker` — replace a ticker's book
  (`{ yes_dollars, no_dollars }`, `[price, count]` string tuples).
- `PATCH /mock/markets/:ticker` — move `close_time`; the backend sees it on
  the next market-cache refresh.
- `POST /mock/reset` — restore every market and book to its startup fixture.

Wired into
`tests/jest/docker-compose.jest.yml` as `kalshi-mock-test`, reached by
pointing `KALSHI_API_BASE_URL` at it — same pattern as `ANTHROPIC_BASE_URL`.
Test credentials are a throwaway RSA-2048 key the mock never validates.

Manual check against demo, with credentials in `.env`:

```bash
pnpm --prefix backend typecheck
node --env-file=../.env.defaults --env-file=../.env -r ts-node/register -e '
const { kalshiService: k } = require("./src/modules/kalshi");
(async () => {
    console.info(await k.getExchangeStatus());
    console.info(await k.getBalance());
})().catch((e) => { console.error(e.message); process.exit(1); });
'
```
