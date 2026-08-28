# Kalshi module

`backend/src/modules/kalshi/`. A transport wrapper over the [Kalshi Trade API
v2](https://docs.kalshi.com/api-reference) REST surface — the venue Propheta
trades on. It signs, sends and types requests; it holds no domain logic. Market
matching, risk validation and the dry-run guard live in the services that call
it.

Nothing HTTP-facing is exposed yet: no routes, no controllers. This module is
the seam later pipeline stages call.

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

Writes use the V2 order paths (`/portfolio/events/orders`). The legacy
`/portfolio/orders` write endpoint is deprecated by Kalshi no earlier than
2026-05-06.

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

No Kalshi mock service and no integration tests yet — they land with the
execution stage, alongside a mock under `mocks/` in the pattern of
`mocks/x-api-mock`.

Manual check against demo, with credentials in `.env`:

```bash
pnpm --prefix backend typecheck
pnpm --prefix backend ts-node -e "
  import('./src/modules/kalshi').then(async (k) => {
    console.info(await k.getExchangeStatus());
    console.info(await k.getBalance());
  });
"
```
