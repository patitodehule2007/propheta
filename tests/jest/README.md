# Integration tests

Jest suite that runs against a real backend, a dedicated test database, and
Redis, all inside an ephemeral Docker Compose stack.

## Run

```bash
docker compose -f tests/jest/docker-compose.jest.yml up --build
```

or, equivalently:

```bash
tests/jest/run.sh
```

The pre-push git hook runs `tests/jest/run.sh` automatically.

## How it works

- `docker-compose.jest.yml` inlines all fixtures in the `x-test-environment`
  anchor and merges them into every service, so no environment file is needed.
  The database runs on tmpfs and the whole stack is torn down when the run ends.
- `db-init-test` runs knex migrations and loads the SQL assets.
- `db-seed-test` loads the demo fixtures from `database/init/sql/seed/`.
- `backend-test` is the real API image; the suite hits it over HTTP.
- `run.sh` drives the one-shot services with `run --rm` so each step can be
  sequenced and reported independently.

## Writing tests

- Place test files under `src/` with the `.test.ts` suffix.
- Use the standard Jest API (`describe` / `it` / `expect`).
- Name tests `should {expected behavior} when {condition}`.
- Never hardcode IDs, dates, or values — use factories, fixtures, or builders.
