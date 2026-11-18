# Frontend

React + Vite SPA. See `docs/frontend/design.md` for visual/UX conventions —
read it before touching any UI code.

## Routes (`frontend/src/App.tsx`)

- `/login` — public, `pages/LoginPage.tsx`.
- `/` and `/accounts` — behind `components/ProtectedRoute.tsx`, nested
  under `components/DashboardLayout.tsx` (shared sidebar nav + logout).
- `/demo` and `/demo/:scenarioId` — public, `demo/DemoDashboardPage.tsx`.
  Registered **only** when `VITE_ENABLE_DEMO=true` (see "Simulated demo" below).

`App` calls `authStore.fetchCurrentUser()` once on mount to restore session
state from the `GET /api/auth/me` cookie-backed session before routing
decides whether to redirect to `/login`.

## State

`store/authStore.ts` — zustand store: `user`, `isAuthenticated`,
`isLoading`, and `login`/`logout`/`fetchCurrentUser` actions, all through
`requestService`. No other global store exists yet; page-local state (lists,
form inputs) lives in the page component via `useState`.

## Pages

- `pages/LoginPage.tsx` — email/password form, `zod`-validated client-side,
  calls `authStore.login`.
- `pages/DashboardPage.tsx` — fetches the recent decisions and renders
  `components/dashboard/DashboardView.tsx`. Metrics (PnL, open positions,
  latency, hit rate), the latest post with its pipeline progress, and open
  positions render explicit "Not available yet" states (backend modules don't
  exist yet — see
  `docs/projectDefenition/functionality_&_limits.md`). The recent-decisions
  card is real, backed by the existing `GET /api/webhooks/x/decisions`.
- `pages/AccountsPage.tsx` — list/add/remove monitored X accounts against
  `/api/accounts` (see `docs/backend/ingestion.md`).

## Simulated demo (presentations)

`frontend/src/demo/` renders the **same** `DashboardView`, `AppShell` and
`StatusBar` as the live app, fed with fixed data instead of the API — no
backend and no login needed. It exists because a real buy is unlikely to
happen on Kalshi's demo environment with old posts.

- `demo/demoScenarios.ts` — three scenarios, using the real `decision_log`
  vocabulary and only the rows the backend actually writes (gates that pass
  silently write no row):
  - `before` — agent flat, the last post (a real Trump/Lilly post from
    `scripts/http/x-api-mock.http`) was filtered as `topic_not_tradable`.
  - `after-buy` — a WhiteHouse post about the Fed Chair nominee; the market
    still trades at 61¢ vs an 84% fair value, every gate passes and an order
    is placed (new position, PnL and readouts change, new rows marked in the tape).
  - `after-no-trade` — the same post when the market already trades at 92¢:
    the selection agent returns `NO_TRADE` / `already_priced_in`.
- `demo/DemoDashboardPage.tsx` — `/demo/:scenarioId` with a `SIMULATED`
  badge and a scenario switcher; `?clean=1` hides both for screenshots.
  Unknown scenarios redirect to `/demo/before`.

Enable it with the build-time flag `VITE_ENABLE_DEMO=true`. It is read only in
`demo/lazyDemoDashboardPage.ts`, right next to the dynamic `import()`, so the
bundler can resolve it at build time: without the flag the route is not
registered and the demo code is not even emitted into `dist/`. The Docker image
does not set it, so production never ships the demo:

```sh
cd frontend && VITE_ENABLE_DEMO=true pnpm dev   # → http://localhost:5173/demo
```

Rendered screenshots live in `docs/entregas/screenshots/propheta-demo-*.png`.

## Request handling

Never call `fetch` or `axios` directly in components — always
`shared/requestService.ts`. Its response interceptor retries a `401` once
via a silent `POST /api/auth/refresh`; if that also fails it calls the
callback registered by `authStore` via `setAuthFailureHandler` to clear
client-side session state (kept as a callback, not a direct import, to
avoid a circular dependency between the request service and the store).

`shared/apiError.ts` — `extractErrorMessage(err)` pulls the client-safe
`error.message` out of a failed `requestService` call for display; falls
back to a generic message for network/unexpected failures.

## Styling

No CSS framework. `styles/tokens.css` (colors, spacing, type scale) and
`styles/layout.css` (nav, cards, tables, forms), both imported once in
`main.tsx`. See `docs/frontend/design.md` for the token values and when to
use each state (loading/error/empty).
