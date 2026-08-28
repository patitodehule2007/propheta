# Ingestion module

Fase 0-1 slice of the Propheta pipeline described in
`docs/projectDefenition/`: receives `post.create` events for monitored
political accounts, verifies them, and writes an auditable decision log.
Classification now happens too (`docs/backend/agent.md`) — kicked off from
here but living in its own module. Market matching and order execution are
still later phases.

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

`POST /api/webhooks/x/registration` — ensures a webhook pointing at
`X_WEBHOOK_TARGET_URL` is registered with X (`ensureWebhookRegistered` in
`modules/ingestion/ingestion.service.ts`, calling the X API via
`modules/ingestion/xApiClient.service.ts`): lists the account's existing
webhooks and creates one only if none match the target URL. Idempotent —
safe to call repeatedly (e.g. on deploy). `X_WEBHOOK_TARGET_URL` has no
default and must be set per environment: the real X API rejects webhook
URLs that include a port number.

## Managing monitored accounts

`GET/POST /api/accounts`, `DELETE /api/accounts/:id`
(`backend/src/routes/accounts.routes.ts`, `controller/accounts.controller.ts`)
— behind `authMiddleware` (see `docs/backend/auth.md`), used by the
dashboard's Accounts page:

- `GET /api/accounts` — paginated (`limit`/`offset` + `totalCount`) list of
  every monitored account, active or not.
- `POST /api/accounts` — `{ handle }`. Resolves the handle to its platform
  user id via `getUserByUsername` in `xApiClient.service.ts`
  (`GET /2/users/by/username/:handle`), then inserts it
  (`addMonitoredAccount` in `ingestion.service.ts`). A handle already
  monitored raises a unique violation, mapped to `409 CONFLICT`.
- `DELETE /api/accounts/:id` — soft delete (`is_active = false`), not a hard
  delete: keeps referential integrity with `ingested_posts` and
  `decision_log`. Unknown id → `404 NOT_FOUND`.

## Processing flow (`modules/ingestion/ingestion.service.ts`)

This module is the **TWEET_RECEIVED stage** of the pipeline, not the entry
point: `modules/desicionPipeline/orchestrator.service.ts` calls it and decides
what happens next (see `docs/backend/decisionPipeline.md`).

`receiveEvent` returns an `IngestionResult` — a discriminated union of
`{ status: INGESTED, post, account }` or `{ status: DISCARDED, reason }` — so
the orchestrator can branch. It does not return `void`: a stage that swallowed
its own outcome could not be composed into a pipeline. The resolved `account`
is handed back with the post so downstream stages do not re-query it.

1. Verify `x-twitter-webhooks-signature` (HMAC-SHA256, constant-time
   compare). Invalid → log `DISCARDED` / `invalid_signature`, then throw
   `AuthenticationError`. The throw is deliberate and stays: an invalid
   signature is an HTTP concern (401), not a pipeline outcome.
2. Look up the author by `platform_user_id` in `monitored_accounts`. Not
   found or inactive → log `DISCARDED` / `author_not_monitored`, return
   (200 — this is not an error, just nothing to act on).
3. Insert into `ingested_posts` (unique constraint on `platform_post_id`
   handles dedup atomically — no application-level duplicate check). Insert
   returns no row on conflict → log `DISCARDED` / `duplicate_post`.
4. Otherwise → log `INGESTED`, `reason: null`.

Stage/decision/reason values come from
`backend/src/shared/core/decisionLog.constants.ts`, never string literals at
the call site. This mirrors the `TWEET_RECIBIDO` stage of the state machine in
`docs/projectDefenition/initial_investigation.md` §6.1 — the code spells it
`TWEET_RECEIVED`, since the project is English-only. Later phases append their
own `decision_log` rows for the same `platform_post_id` as those stages land —
this table is designed to accumulate the whole audit trail, not just this
stage.

## What goes in `decision_log.metadata`

The rule is **do not duplicate what the foreign key already reaches**:

- **`INGESTED` rows carry no metadata.** `ingested_post_id` reaches the text,
  the author and the handle through `ingested_posts` → `monitored_accounts`.
  Copying them into the log would denormalize them across every stage row the
  post goes on to produce.
- **`DISCARDED` rows carry `authorId` and the post `text`.** A discarded post
  never reaches `ingested_posts`, so its `decision_log` row — with
  `ingested_post_id NULL` — is the _only_ surviving record of the event.
  Without them, an `invalid_signature` discard (a security alert, per §6.1)
  left nothing to investigate, and an `author_not_monitored` discard threw away
  exactly the data needed to decide whether to start monitoring that account.
  The text is truncated to `MAX_AUDITED_TEXT_LENGTH` (500 chars) because an
  unsigned payload is attacker-controlled and must not be stored unbounded.
- **`invalid_signature` rows also carry `isPayloadVerified: false`**, so the
  retained author and text are never mistaken for a genuine X event.

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

`config.dryRun` (`DRY_RUN`, default `true`) exists so later phases (execution)
have one config surface to gate on, per the project's dry-run-by-default rule.

It is currently **read by nothing**. It used to be written into every
`INGESTED` row's metadata, which was misleading: the flag gates order
execution, and this stage sends no orders, so recording it here implied it had
influenced a decision it could not affect. It belongs on the `ORDEN_ENVIADA`
row, where it will actually change behaviour.

## Testing

`tests/jest/src/ingestion/webhook.test.ts` drives the whole slice through
`mocks/x-api-mock`: CRC challenge, a monitored-author post, an
unmonitored-author post, and a forged-signature post, asserting on the
`decision_log` rows each produces via `GET /api/webhooks/x/decisions`. It also
covers the enrichment stage — see `docs/backend/decisionPipeline.md`.

Because a post now produces one row per stage, `waitForDecision` takes an
optional `stage` to disambiguate; `listDecisionStages` asserts that a stage was
_not_ reached.
