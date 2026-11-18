# DESIGN.md — Propheta frontend

Single source of interface values. Code tokens live in `frontend/src/styles/tokens.css`;
keep both in sync in every change that touches either. UX conventions (states, feedback,
accessibility) are in [design.md](design.md).

## Direction — "Probability tape"

Propheta reads like the price tape of a prediction market. Big monospace figures and data
typography carry the hierarchy; color is rare and always means something.

- **Qualities:** precise, dense, calm under load.
- **Anti-qualities:** glowing neon dashboard, marketing cards, decorative gradients.
- **Leading device:** data typography (mono figures, 0–100¢ price bars).
- **Motion:** short and mechanical — controls compress and spring back, the nav indicator
  slides, loaded rows rise 4px in a capped stagger. Nothing moves while idle except a
  skeleton sweep during loading.

## Color

| Token                    | Value                     | Role                                         |
| ------------------------ | ------------------------- | -------------------------------------------- |
| `--color-bg`             | `#07090d`                 | Page ground (ink black, blue tint)           |
| `--color-surface`        | `#0c1016`                 | Panels, rail                                 |
| `--color-surface-raised` | `#131924`                 | Buttons, hover rows, active nav, bar track   |
| `--color-border`         | `#1d2533`                 | Hairlines                                    |
| `--color-border-strong`  | `#2e394b`                 | Control borders, empty readout dash          |
| `--color-text`           | `#e8ecf2`                 | Primary text                                 |
| `--color-text-muted`     | `#8f99ab`                 | Labels, meta                                 |
| `--color-signal`         | `#5ad1e6`                 | The one accent: primary action, focus, bars  |
| `--color-signal-ink`     | `#04161b`                 | Text on signal                               |
| `--color-up` / `-soft`   | `#3fd68f`                 | Positive outcome, live — always with ▲/text  |
| `--color-down` / `-soft` | `#ff5c66`                 | Negative outcome, errors, kill switch — ▼/text |
| `--color-warn` / `-soft` | `#f0b44c`                 | Warnings                                     |

## Typography

| Token            | Value                   | Role                                     |
| ---------------- | ----------------------- | ---------------------------------------- |
| `--font-display` | Archivo, `wdth` 75      | Brand, page and panel titles             |
| `--font-body`    | IBM Plex Sans           | UI text                                  |
| `--font-mono`    | Martian Mono, tabular   | Figures, times, handles, enum values     |

Scale: `--text-micro` 12 · `--text-meta` 13 · `--text-body` 14 · `--text-section` 18 ·
`--text-title` 24 · `--text-readout` 40 · `--text-brand` 56 (login only). Loaded from Google
Fonts in `frontend/index.html`.

## Space, shape, size

- Spacing: `--space-1..7` = 4/8/12/16/24/32/48px.
- Radii: `--radius-control` 2px, `--radius-panel` 4px.
- Control heights: `--control-sm` 28, `--control-md` 36, `--control-lg` 44.
- Layout: `--rail-width` 208px, `--content-max` 1280px, `--bar-height` 6px (price bar).

## Motion

Tokens `--motion-*`, `--ease-*`, `--spring-pop`, `--spring-snap` in `tokens.css`. Interaction
baseline in `styles/motion.css` + `shared/pressFeedback.ts` (ported from the better-design
interaction kit, installed once in `App.tsx`). Classes: `.ui-press` (buttons), `.ui-dim`
(nav links), `.ui-field` (inputs), `.ui-enter` (loaded rows, `--enter-index`, max 6 steps).
Reduced motion keeps color/opacity feedback and drops travel and scale.

## Components (`frontend/src/components/ui/`)

`Button` (variants default/primary/ghost/danger, sizes sm/md/lg, `isPending`),
`StatusIndicator` (live/down/not-wired — shape + text), `Readout` (big figure, `null` → "—"),
`SkeletonRows` (mirrors tape grid), `ErrorBanner` (with Retry), `DecisionChip` (▲/▼/○ + value),
`ProbabilityBar` (entry price on 0–100¢ with stop/target marks — only drawn from real
`metadata.entryPriceCents`). Shell: `DashboardLayout` (rail + sliding indicator), `StatusBar`.
