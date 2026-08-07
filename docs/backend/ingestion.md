# Ingestion module

Fase 0-1 slice of the Propheta pipeline described in
`docs/projectDefenition/`: receives `post.create` events for monitored
political accounts, verifies them, and writes an auditable decision log.
No classification, market matching, or order execution happens yet — those
are later phases.

## Source of the events

In every environment shipped so far (dev, test), events come from
`mocks/x-api-mock`, a small Express service that speaks the subset of the
[X Activity API](https://docs.x.com/x-api/activity/introduction) this
project needs: user lookup, webhook registration + CRC challenge, activity
subscriptions, and a test-only `POST /mock/simulate-post` helper that
signs and delivers a `post.create` event. No real X API credentials exist
for this project yet; `backend/src/config` points `xApi.baseUrl` at the mock
by default (`X_API_BASE_URL`).

## Webhook contract

`GET/POST /api/webhooks/x` (`backend/src/routes/xWebhook.routes.ts`):

- `GET` — answers X's Challenge-Response Check. Reads `crc_token` from the
  query string, returns `{ response_token: "sha256=" + base64(hmac) }`
  computed with `X_WEBHOOK_CONSUMER_SECRET`. This is the one endpoint in the
  codebase that intentionally does not use the standard `{ data, message }`
  envelope — it has to match X's external contract exactly.
- `POST` — receives a `post.create` event. The raw request body is captured
  via `express.json({ verify })` in `backend/src/index.ts` (see
  `req.rawBody`) so the `x-twitter-webhooks-signature` header can be
  verified against the exact bytes received, not a re-serialized copy.
  An invalid or missing signature throws `AuthenticationError` (401).

`GET /api/webhooks/x/decisions` — paginated (`limit`/`offset` +
`totalCount`) read of the audit log, optionally filtered by
`platformPostId`. Exists mainly so integration tests and the future
dashboard can assert on what the pipeline decided.

## Processing flow (`modules/ingestion/ingestion.service.ts`)

1. Verify `x-twitter-webhooks-signature` (HMAC-SHA256, constant-time
   compare). Invalid → log `decision_log` row (`DESCARTADO`,
   `reason: invalid_signature`), throw.
2. Look up the author by `platform_user_id` in `monitored_accounts`. Not
   found or inactive → log `DESCARTADO` / `author_not_monitored`, return
   (200 — this is not an error, just nothing to act on).
3. Insert into `ingested_posts` (unique constraint on `platform_post_id`
   handles dedup atomically — no application-level duplicate check). Insert
   returns no row on conflict → log `DESCARTADO` / `duplicate_post`.
4. Otherwise → log `INGESTED`, `reason: null`.

This mirrors the `TWEET_RECIBIDO` stage of the state machine in
`docs/projectDefenition/initial_investigation.md` §6.1. Later phases
(classification, matching, risk, execution) will append their own
`decision_log` rows for the same `platform_post_id` as those stages land —
this table is designed to accumulate the whole audit trail, not just this
stage.

## Database

- Tables: `monitored_accounts`, `x_webhook_subscriptions`,
  `ingested_posts`, `decision_log` — schema in
  `database/init/migrations/20260807000001_create_ingestion_tables.ts`.
- Executable SQL: `database/init/sql/functions/ingestion/*.sql`, one atomic
  function per operation, no `EXCEPTION` blocks. The backend
  (`backend/src/repositories/postgres/ingestion.repository.ts`) is the only
  place that calls them.
- Seed: `database/init/sql/seed/ingestion_accounts.sql` — dev/test-only
  monitored accounts, matching the fixture map in `mocks/x-api-mock`.

## Dry-run

`config.dryRun` (`DRY_RUN`, default `true`) is recorded on every `INGESTED`
decision's metadata. Nothing in this module sends orders regardless of the
flag — it exists now so later phases (execution) have one config surface to
gate on, per the project's dry-run-by-default rule.

## Testing

`tests/jest/src/ingestion/webhook.test.ts` drives the whole slice through
`mocks/x-api-mock`: CRC challenge, a monitored-author post, an
unmonitored-author post, and a forged-signature post, asserting on the
`decision_log` rows each produces via `GET /api/webhooks/x/decisions`.
