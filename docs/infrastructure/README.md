# Infrastructure

Local development stack for Propheta, defined in `docker-compose.yml`.

## Docker Services

| Service           | Image / Build      | Purpose                                        |
| ----------------- | ------------------ | ---------------------------------------------- |
| `frontend`        | `./frontend`       | React SPA served by Nginx on port 3000         |
| `backend`         | `./backend`        | Express API on port 5000                       |
| `db`              | `postgres:16`      | PostgreSQL 16 on port 5432                     |
| `db-password-sync`| `postgres:16`      | One-shot SCRAM password sync                   |
| `db-init`         | `./database/init`  | One-shot database initializer (migrations + SQL) |
| `db-seed`         | `./database/init`  | One-shot demo seed (only if the DB is empty)   |
| `redis`           | `redis:7`          | Redis 7 on port 6379                           |
| `x-api-mock`      | `./mocks/x-api-mock` | Mocks the X Activity API (no real X credentials yet) |

### Service Dependencies

```
frontend ──depends_on──▶ backend
backend  ──depends_on──▶ db-seed
backend  ──depends_on──▶ x-api-mock
db-seed  ──depends_on──▶ db-init
db-init  ──depends_on──▶ db-password-sync
db-password-sync ──depends_on──▶ db
```

### Volumes

| Volume          | Mount                       | Purpose                          |
| --------------- | --------------------------- | -------------------------------- |
| `postgres_data` | `/var/lib/postgresql/data`  | Persistent DB data               |
| `postgres_socket` | `/var/run/postgresql`     | Unix socket for local auth       |
| `redis_data`    | `/data`                     | Persistent Redis data            |

### Networks

Single internal bridge network (`internal`). Only `frontend:3000`,
`backend:5000`, and (dev-only) `db:5432` and `redis:6379` expose host ports.

## Backend (Express)

- Listens on `0.0.0.0:5000`.
- No static file serving — all requests are API.
- `/api/health` is the health check used by the container healthcheck.

## Frontend (Nginx)

- Serves the built React SPA from `/usr/share/nginx/html`.
- SPA fallback: all unknown paths serve `index.html`.
- Does not proxy `/api`; the Vite dev server does that in development.

## Database init

`database/init` is a one-shot container with two commands:

- `init` — creates the `propheta` schema and `app_user` role, runs knex
  migrations, loads SQL objects (functions, procedures, triggers), applies
  grants, and executes `sql/security/*.sql`.
- `seed-if-empty` — loads `sql/seed/*.sql` only when no application table has
  rows yet. Never runs with `NODE_ENV=production`.

Executable database objects never live in migrations; they are rebuilt on every
`db-init` from `database/init/sql/`.

## Environment Variables

| Variable             | Description                  | Default            |
| -------------------- | ---------------------------- | ------------------ |
| `NODE_ENV`           | Environment mode             | `development`      |
| `PORT`               | Backend listen port          | `5000`             |
| `DB_HOST`            | PostgreSQL host              | `db`               |
| `DB_PORT`            | PostgreSQL port              | `5432`             |
| `POSTGRES_DB`        | Database name                | `propheta`         |
| `POSTGRES_USER`      | Database user                | `propheta`         |
| `POSTGRES_PASSWORD`  | Database password            | —                  |
| `DB_USER`            | Application DB role          | `app_user`         |
| `DB_PASSWORD`        | Application DB password      | —                  |
| `REDIS_HOST`         | Redis host                   | `redis`            |
| `REDIS_PORT`         | Redis port                   | `6379`             |
| `REDIS_PASSWORD`     | Redis password               | `dev_redis_pass`   |
| `CORS_ALLOWED_ORIGINS` | Allowed CORS origins      | `http://localhost:3000` |
| `SECRET_KEY`         | JWT signing key              | —                  |
| `TIME_ACCESS_TOKEN_LAST` | Access token TTL         | `15m`              |
| `TIME_REFRESH_TOKEN_LAST` | Refresh token TTL       | `7d`               |
| `X_API_BASE_URL`     | Base URL for the X API client | `http://x-api-mock:4100` (dev/test) |
| `X_WEBHOOK_CONSUMER_SECRET` | Shared secret for webhook signature verification (backend) / signing (mock) | — |
| `X_BEARER_TOKEN`     | X API bearer token (unused while `X_API_BASE_URL` points at the mock) | — |
| `DRY_RUN`            | Disables order-sending side effects pipeline-wide | `true`             |

## Running Locally

```bash
# One-time bootstrap (env files, deps, hooks)
scripts/dev-init.sh

# Full stack
docker compose up --build

# Integration tests
tests/jest/run.sh
```
