# Auth module

Single-admin authentication. There is no public registration — one admin
user is created out of band and used to sign into the dashboard.

## Admin user

Created by running, once, against the target environment's database:

```sh
pnpm --prefix backend ts-node src/shared/scripts/createAdminUser.ts
```

Reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` from the environment, hashes the
password with `bcryptjs` (`SALT_ROUNDS`), and inserts the row via the
`create_user` DB function
(`database/init/sql/functions/auth/create_user.sql`). Idempotent: if the
email already exists it logs and exits without erroring (detects the
unique-violation, pg error code `23505`).

For local dev/test convenience, `database/init/sql/seed/auth_admin.sql`
also seeds a fixed demo admin (`admin@propheta.test` /
`test_admin_password`) — same "demo/test-only, not a secret" pattern as
`seed/ingestion_accounts.sql`. `runSeed` refuses to run against
`NODE_ENV=production` (`database/init/init.ts`), so this never reaches a
real deployment.

## Endpoints (`backend/src/routes/auth.routes.ts`)

- `POST /api/auth/login` — `{ email, password }`. Verifies against
  `get_user_by_email` + `bcryptjs.compare`
  (`modules/auth/auth.service.ts`). Sets `propheta_access_token` and
  `propheta_refresh_token` as httpOnly cookies
  (`ACCESS_TOKEN_COOKIE`/`REFRESH_TOKEN_COOKIE` in
  `modules/auth/auth.constants.ts`). Never reveals whether the email or the
  password was wrong — always `401 AUTHENTICATION_ERROR`.
- `POST /api/auth/refresh` — verifies the refresh cookie, reissues the
  access-token cookie.
- `POST /api/auth/logout` — clears both cookies.
- `GET /api/auth/me` — behind `authMiddleware`; returns the authenticated
  user. Used by the frontend to restore session state on page load.

## Token flow

Both tokens are JWTs signed with `config.auth.secretKey` (`SECRET_KEY`),
payload `{ sub: userId, email }`. TTLs: `TIME_ACCESS_TOKEN_LAST` (default
`15m`), `TIME_REFRESH_TOKEN_LAST` (default `7d`). No server-side token
store or revocation list exists yet — logout only clears the client's
cookies; a leaked refresh token remains valid until it expires.

`backend/src/shared/middleware/authMiddleware.ts` reads the access-token
cookie, verifies it, and attaches `req.user = { id, email }`
(`backend/src/shared/types/express.d.ts`). Mounted on `/api/accounts` and
`GET /api/auth/me`. `/api/auth/login`, `/api/auth/refresh`,
`/api/auth/logout`, and the `/api/webhooks/x/*` routes stay public — the
latter has its own external signature-verification contract, not user auth.

The frontend (`frontend/src/shared/requestService.ts`) retries a `401` once
via a silent `POST /api/auth/refresh` before giving up and clearing the
client-side session (`frontend/src/store/authStore.ts`).

## Database

- Table: `users` — `database/init/migrations/20260814000001_create_users_table.ts`.
- Executable SQL: `database/init/sql/functions/auth/*.sql`
  (`get_user_by_email`, `create_user`), same atomic/no-`EXCEPTION` rules as
  every other module.
- `backend/src/repositories/postgres/auth.repository.ts` is the only place
  that calls them.
