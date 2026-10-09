# Testing

Integration test suite. Tests run against a real backend with a dedicated test
database and Redis, inside an ephemeral Docker Compose stack.

## Integration test environment

The Jest Compose stack needs no environment file.
`tests/jest/docker-compose.jest.yml` inlines its fixtures in the
`x-test-environment` anchor and merges that block into every service.

`environment:` outranks `env_file:`, so those fixtures override
`.env.defaults`, which the stack still loads and which is committed. Adding a
service to this stack means merging `<<: *test-environment` into it — omitting
it silently hands that service the development values.

## Run

```bash
tests/jest/run.sh
```

The pre-push git hook runs the suite automatically; the CI test job calls the
same script so the two cannot drift.

## Manual API testing

For exploratory requests against the dev stack (`docker compose up --build`),
use the REST Client files in `scripts/http/`, including the
`/mock/simulate-post` flow that drives a post through the decision pipeline.
`x-api-mock` is published on `127.0.0.1:4100` for this. Setup and flow:
[`scripts/http/README.md`](../../scripts/http/README.md).

## Writing tests

- Place test files under `tests/jest/src/` with the `.test.ts` suffix.
- Use the standard Jest API (`describe` / `it` / `expect`).
- Name tests `should {expected behavior} when {condition}`.
- Use factories, fixtures, or builders — never hardcode IDs, dates, or values.
