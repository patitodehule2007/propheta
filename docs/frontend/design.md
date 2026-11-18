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

Dark operator console (trading dashboard, long viewing sessions). Defined as
CSS custom properties on `:root` in `frontend/src/styles/tokens.css`.

| Token                | Value                    | Use                              |
| --------------------- | ------------------------ | --------------------------------- |
| `--color-bg`           | `#0b0e14`                | Page background                   |
| `--color-surface`      | `#141821`                | Cards, panels                     |
| `--color-surface-alt`  | `#1c212c`                | Nested/hover surface               |
| `--color-border`       | `#262c38`                | Dividers, card borders            |
| `--color-text`         | `#e6e9ef`                | Primary text                      |
| `--color-text-muted`   | `#8a92a3`                | Secondary text, labels            |
| `--color-primary`      | `#4f8cff`                | Primary actions, links, focus     |
| `--color-success`      | `#3ecf8e`                | Positive PnL, healthy status      |
| `--color-danger`       | `#f2545b`                | Negative PnL, errors, kill switch |
| `--color-warning`      | `#f2b155`                | Degraded status, warnings         |
| `--space-1..6`         | `4/8/12/16/24/32px`      | Spacing scale                     |
| `--radius`             | `8px`                    | Card/button/input corner radius   |
| `--font-sans`          | system font stack        | All UI text                       |
| `--font-mono`          | system mono stack        | Tickers, ids, numeric data         |

Type scale: `14px` body, `13px` muted/labels, `20px` section headings,
`28px` page titles. One weight (600) for emphasis, regular otherwise.

## States

- **Loading**: inline spinner or skeleton block matching the content's
  shape. Never blank the whole page for a partial refresh.
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

- `DashboardLayout`: fixed left nav (Dashboard, Accounts, Logout) +
  scrollable content area. Single column on screens under `768px` — nav
  collapses to a top bar.
- Cards: `--color-surface` background, `--radius` corners, `--space-4`
  padding, `--color-border` 1px border.

## Accessibility

- Visible focus ring on every interactive element: `2px solid --color-primary`, `2px` offset — never `outline: none` without a replacement.
- Label every form input explicitly (`<label htmlFor>`), never placeholder-only.
- Text/background contrast at or above WCAG AA (tokens above are chosen to satisfy this).
- Buttons are real `<button>` elements; links that navigate are real `<a>`/`<Link>`.
