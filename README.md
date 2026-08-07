# Propheta

Full web app for agentic trading (autonomous trading agents).

## Stack

| Package           | What it is                                                        |
| ----------------- | ----------------------------------------------------------------- |
| `backend/`        | Express + TypeScript API. Queries via `pg` to DB functions.       |
| `frontend/`       | React + Vite SPA (zustand, react-router-dom, axios via requestService). |
| `database/init/`  | DB provisioning: knex migrations + SQL assets.                    |
| `mocks/x-api-mock/` | Mocks the X Activity API (no real X credentials yet).           |
| `tests/`          | Integration tests (Jest, own docker-compose with inlined fixtures). |
| `docs/`           | Project docs.                                                     |
| `scripts/`        | Bootstrap and dev tooling.                                        |

## Prerequisites

- Node.js 22.13+ (pnpm 11 via corepack)
- Docker + Docker Compose

## Setup

```bash
scripts/dev-init.sh
```

Checks prereqs, copies `.env.example` -> `.env`, installs dependencies in all
packages, and activates git hooks (`scripts/hooks/`).

## Run

```bash
docker compose up --build
```

- Frontend (Nginx): http://localhost:3000
- Backend API: http://localhost:5000
- PostgreSQL: localhost:5432
- Redis: localhost:6379

Frontend dev server with hot reload (proxies `/api` to `:5000`):

```bash
pnpm --prefix frontend run dev
```

## Tests

```bash
docker compose -f tests/jest/docker-compose.jest.yml up --build
```

A pre-push hook runs the integration suite automatically.

## Environment

Compose loads `.env.defaults` first, then `.env` overrides. Templates live in
`.env.example`. Never commit live `.env*` files.
