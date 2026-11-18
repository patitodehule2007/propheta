# Frontend design

Single source of truth for visual design and UX conventions, per
`CLAUDE.md`. Read before creating or modifying any frontend UI. No CSS
framework is installed — plain CSS with custom properties
(`frontend/src/styles/tokens.css`), imported once in `main.tsx`.

## UI design workflow

New or redesigned interfaces follow the discovery-first flow in `CLAUDE.md`
("UI design workflow"): discovery questions, 2–3 visual directions, the user
picks one, then build with the project-local `better-design` and
`frontend-design` skills (`.claude/skills/`). Verify at desktop and mobile
widths.

## Tokens

All interface values (color, type, spacing, radii, sizes, motion) and the visual
direction live in [DESIGN.md](DESIGN.md), mirrored in `frontend/src/styles/tokens.css`.
Stylesheets: `tokens.css`, `motion.css`, `layout.css`, `components.css`, imported in
`main.tsx`.

## States

- **Loading**: `SkeletonRows` matching the tape's grid for lists; in-button
  spinner (`Button isPending`) for actions. Never blank the whole page for a partial refresh.
- **Error**: an inline banner (`--color-danger` left border, surface
  background) with the message from the API's `error.message` — never a raw
  stack trace, matching the backend's safe-error-response rule. Include a
  retry action when the failed call is retryable.
- **Empty**: a centered muted message inside the card/section
  ("No accounts yet — add one above.", "Not available yet — this module
  isn't built."). Never render a table with fabricated zero rows.
- **Not-yet-implemented dashboard sections** use the same empty-state
  pattern with a fixed message: "Not available yet."

## Feedback

- Form validation errors render inline under the field, not as a toast.
- Transient outcomes (login failure, account added/removed) use a toast in
  the top-right, auto-dismiss after 4s, `--color-danger`/`--color-success`
  left border matching the outcome.
- Destructive actions (remove account) require a confirm step (native
  `window.confirm` is acceptable at this scale — no custom modal system
  exists yet).

## Layout

- `DashboardLayout`: sticky left rail (brand, Dashboard, Accounts, Log out)
  with a sliding active indicator, a sticky `StatusBar` (X webhook, Kalshi
  WebSocket, kill switch — "not wired"/unavailable until the backend exposes
  them), and the content column. Under `768px` the rail becomes a top bar.
- Panels: `.panel` + `.panel-head`; lists are `.tape` rows, not tables.

## Accessibility

- Visible focus ring on every interactive element: `2px solid --color-signal`, `2px` offset — never `outline: none` without a replacement.
- Label every form input explicitly (`<label htmlFor>`), never placeholder-only.
- Text/background contrast at or above WCAG AA (tokens above are chosen to satisfy this).
- Buttons are real `<button>` elements; links that navigate are real `<a>`/`<Link>`.
