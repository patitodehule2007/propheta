# Frontend

React + Vite SPA. See `docs/frontend/design.md` for visual/UX conventions —
read it before touching any UI code.

## Routes (`frontend/src/App.tsx`)

- `/login` — public, `pages/LoginPage.tsx`.
- `/` and `/accounts` — behind `components/ProtectedRoute.tsx`, nested
  under `components/DashboardLayout.tsx` (shared sidebar nav + logout).

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
- `pages/DashboardPage.tsx` — connection status, positions, PnL, kill
  switch, latency, and hit-rate sections render as explicit "Not available
  yet" cards (backend modules don't exist yet — see
  `docs/projectDefenition/functionality_&_limits.md`). The recent-decisions
  card is real, backed by the existing `GET /api/webhooks/x/decisions`.
- `pages/AccountsPage.tsx` — list/add/remove monitored X accounts against
  `/api/accounts` (see `docs/backend/ingestion.md`).

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
