# Project Rules

> **Always use the required agent for the task** (e.g. DB tasks → DB agent).
> **No raw SQL.** Call existing query functions / stored procedures; if one doesn't exist, create it.
> **No business logic or error-handling logic in the database.** All logic, including error interpretation and response decisions, must live in the backend. Database functions must be **atomic** (one operation per call). The backend coordinates the sequence.

`AGENTS.md` is a pointer to this file. This file is the single source of truth for project rules.

Propheta is a full web app for **agentic trading** (autonomous trading agents). Domain specifics (agents, market data, orders, positions) are not defined yet — add them here as they are decided.

---

## Repo Map

Multi-package repo (separate pnpm projects, no root workspace). Package manager: **pnpm** (pinned via `packageManager`).

| Path               | What it is                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/`         | Express + TypeScript API. Queries use `pg` with parameterized calls to DB functions.                                                    |
| `frontend/`        | React + Vite SPA. zustand (state), react-router-dom, axios (only via `requestService`).                                                |
| `database/init/`   | DB provisioning: knex migrations (`migrations/YYYYMMDDNNNNNN_*.ts`) + SQL assets in `sql/{functions,procedures,security,seed,triggers}`. |
| `mocks/x-api-mock/` | Mocks the X Activity API (webhooks, CRC, subscriptions) until real X credentials exist.                                                |
| `tests/`           | Integration tests (Jest, own docker-compose with inlined fixtures).                                                                     |
| `docs/`            | Project docs.                                                                                                                           |
| `scripts/`         | Bootstrap and dev tooling.                                                                                                              |

Infra: PostgreSQL, Redis, Docker Compose.

---

## How to Run & Test

- **One-time bootstrap:** the canonical setup script under `scripts/` — checks prereqs, copies env templates, installs deps in all packages.
- **Full stack:** `docker compose up --build`.
- **Integration tests:** run via the dedicated docker-compose file. A **pre-push hook** runs them automatically.
- **DB init order (compose):** `db` → `db-init` (knex) → `db-seed` (seed-if-empty) → `backend`.

---

## Environment & Config

- Compose loads `.env.defaults` first, then `.env` overrides. Templates: `.env.example`. Never commit live `.env*` files.
- Backend config is centralized in `backend/src/config/`. **Never read `process.env` anywhere else.**
- Two DB roles: `POSTGRES_USER` (system) vs `DB_USER` (application), reconciled by a password-sync job.

---

## Workflow

- **Plan before code.** Always present a detailed plan and wait for explicit approval before writing any code. Never skip the planning phase.
- **Language: English only** — code, comments, variable/function names, docs, commit messages, and git branches.
- **Keep docs in sync.** After completing any task that changes behavior, APIs, module structure, or test setup, update the relevant files under `docs/`. If a module doc exists, update it when that module changes.

---

## Security

- **No credentials in code.** Never commit passwords, API keys, tokens, or secrets. Use environment variables or a secret manager.
- **Validate and sanitize all user input** on both client and server before processing.
- **Escape user-generated content** before rendering in HTML (XSS prevention).
- **CORS:** configure explicitly (`CORS_ALLOWED_ORIGINS`). Never use `*` in production.
- **Auth:** JWT access/refresh tokens. Never store passwords in plain text (bcrypt).
- Trading domain: never hardcode API keys for exchanges or market-data providers.

---

## Database

### Queries

- **Always parameterized.** Use placeholders (`$1`, `$2`). Never interpolate or concatenate user input into SQL strings.
- **No raw SQL with hardcoded values.** Call existing query functions / stored procedures; if one doesn't exist, create it.
- **Avoid `SELECT *` on tables.** Explicitly list columns. **Exception:** `SELECT * FROM some_function($1)` is acceptable when calling a set-returning DB function.
- **Always use EXISTS over COUNT(*)** for existence checks.

```js
// bad
db.query(`SELECT * FROM users WHERE id = ${userId}`);
// good
db.query('SELECT id, name FROM get_user($1)', [userId]);
```

### Schema & migrations

- All schema changes go through **knex migration files** in `database/init/migrations/` (named `YYYYMMDDNNNNNN_description.ts`). Never modify schema manually or inline.
- **Migrations are for persistent state only:** tables, columns, constraints, indexes, extensions, and required data transformations. Once committed or applied, a migration is immutable; never edit or repurpose it. Add a new migration for a later persistent-schema change.
- **Executable database objects never belong in migrations.** Do not create, replace, alter, or carry rollback copies of functions, procedures, triggers, or RLS policies in a migration.
- SQL functions/procedures live in `database/init/sql/` — the canonical definitions for executable database objects and policies, rebuilt on every `db-init`. To change function behavior, edit the owning SQL asset only.
- Always include `created_at` and `updated_at` columns.
- Always declare foreign keys.
- Use transactions for any multi-step / multi-table operation.

### Performance

- **No N+1 queries.** Use JOINs, subqueries, or batch fetching instead of querying inside loops.
- Add indexes on columns used in `WHERE`, `JOIN`, and `ORDER BY`.
- Lazy-load when possible; don't fetch full datasets when a subset suffices.

### Error responsibilities

- Database functions must not use error handling as control flow or business logic: do not catch, swallow, translate, or branch on errors with `EXCEPTION` blocks.
- Let database errors propagate to the backend. The backend is responsible for interpreting them, mapping them to typed errors, logging them, choosing the HTTP response, and rolling back multi-step operations.
- `EXCEPTION WHEN OTHERS` is forbidden. Use only database-native constraints and atomic functions for data integrity; do not implement application error handling in SQL.

---

## Naming Conventions

| Element                    | Convention                                                    |
| -------------------------- | ------------------------------------------------------------- |
| Variables, functions       | `camelCase`                                                   |
| Classes, types, interfaces | `PascalCase` (only prefix with `I` if project requires)       |
| Constants, env vars        | `UPPER_SNAKE_CASE`                                            |
| Files                      | `camelCase` or `kebab-case` (be consistent per project)       |
| DB tables                  | `snake_case`, plural                                          |
| DB columns                 | `snake_case`                                                  |
| Indexes                    | `idx_{table}_{column}`                                        |
| Foreign keys               | `fk_{table}_{referenced_table}`                               |
| Primary keys               | `id` (auto-increment or UUID)                                 |
| Enums                      | `PascalCase` name, `UPPER_SNAKE_CASE` values                  |
| Booleans                   | prefix with `is`, `has`, `can`, `should`                      |

---

## Code Quality

- **No hardcoded values.** No IDs, URLs, ports, credentials, magic numbers, or repeated string literals scattered in code. Use env vars, config files, constants, or enums.
- **DRY.** Extract duplicated logic into reusable functions or modules.
- **Single responsibility.** One function = one job. Split if it does more.
- **Early returns / guard clauses** over deeply nested conditionals.
- **Explicit over implicit.** Clear naming and logic over clever patterns.

```js
// bad
if (retries > 3) { ... }
// good
const MAX_RETRIES = 3;
```

### Forbidden patterns

- `eval()` or `Function()` constructor
- `console.log` in production code (use the shared logger)
- `var` (use `const` / `let`)
- `==` / `!=` (use `===` / `!==`)
- Nested ternaries (use `if`/`else` or `switch`)
- God functions (>100 lines). Functions must be modular, short, and focused on a single responsibility
- Lines exceeding 120 characters in length
- Circular dependencies between modules
- Committing `node_modules` or `.env`
- `setTimeout` / `setInterval` for business logic flow control
- Mutating function parameters directly

---

## Error Handling

- **Handle every async operation, DB call, and API request.** No unhandled promises.
- **Custom error classes** live in the backend core errors module: `ValidationError`, `NotFoundError`, `AuthenticationError`. Add new classes there when a new category is needed.
- **Centralized error handler:** a single middleware maps error classes to status codes and the standard error shape. Throw typed errors and let the middleware respond — don't scatter duplicated try/catch response logic.
- **Structured logging:** always use the shared logger (JSON, with context). Never `console.log`.
- **Meaningful messages.** Describe what went wrong; never leak internals to end users.
- **Safe external error responses.** Never expose stack traces, SQL or database errors, query details, file paths, internal IDs, configuration, dependency versions, infrastructure details, or implementation logic. Return only the minimum client-safe message and error code; log diagnostic details server-side.

---

## API Design

- **RESTful conventions:** nouns for resources, HTTP verbs for actions.
- **Versioning:** routes use `/api/` prefix (no URL versioning).
- **Pagination required** on all list endpoints. Never return unbounded result sets. Two schemes in use:
  - **Cursor:** `timeOffset` / `idOffset` / `pageSize` — preferred for large ordered lists.
  - **Offset:** `limit` / `offset` + `totalCount` (search endpoints).
- **Status codes:** 200, 201, 400, 401, 403, 404, 409, 500 — use them correctly.
- **Consistent response shape:**

```json
// success
{ "data": "...", "message": "..." }
// error (produced by the centralized error middleware — the standard)
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

### Middleware stack

`backend/src/shared/middleware/`: `authMiddleware.ts` (JWT session), `error.middleware.ts` (centralized errors), `rateLimitMiddleware.ts` (limits from config).

---

## Frontend — Request Management

Never use native `fetch` or external libraries (axios) directly in components or logic. Always use the centralized `requestService` (wraps axios). If the endpoint or method isn't available, **update the service first**.

```js
// bad
fetch('/api/data').then(res => ...)
// good
requestService.get('/api/data').then(res => ...)
```

---

## Frontend — Visual Design and UX

Visual design rules (interaction patterns, feedback and alert selection, loading/error/empty states, responsive behavior, accessibility) will live in a dedicated design doc — the single source of truth for frontend UI. Create it before building UI and read it before creating or modifying any frontend code.

---

## TypeScript

- **Strict mode on.** No implicit `any`, no unused variables/parameters.
- **Explicit types** for function params, return values, and complex objects.
- **Never use `any`.** Use `unknown` if truly uncertain, then narrow.
- **No non-null assertion (`!`).** Use proper null checks or optional chaining.
- **Interfaces** for object shapes; **type aliases** for unions, intersections, primitives.
- **Enums or const objects** for fixed sets of values.

---

## Project Structure

- Backend: `backend/src/{config,controller,modules,routes,repositories,shared}`. Separation of concerns: routes → controllers → repositories; shared code in `shared/{core,middleware,services,mappers,utils}`.
- **Centralized config module** (`backend/src/config/`). Never scatter `process.env` calls.
- **Index files** for clean exports; avoid deeply nested imports.

---

## Testing

- Unit tests for business logic, integration tests for API endpoints, edge-case tests for critical paths.
- Integration tests run via their own docker-compose with inlined fixtures. A **pre-push hook** runs them automatically.
- **Test naming:** `should {expected behavior} when {condition}` — e.g. `should return 404 when account is not found`.
- Use factories, fixtures, or builders. Never hardcode IDs, dates, or values in tests.

---

## Git

### Commits — conventional commits

**Format:** `{type}({scope}): {description}`
**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

```
feat(agents): add strategy execution engine
fix(trading): correct order status sync
```

### Branches

**Format:** `{type}/{short-description}` — e.g. `feat/strategy-engine`, `fix/order-sync`

---

## Documentation

- **JSDoc** on all exported functions, classes, and interfaces (`@param`, `@returns`, `@throws`).
- **README.md** in every project: setup, env vars, usage examples.
- **Inline comments:** explain the *why*, not the *what*. Code should be self-documenting for the what.
