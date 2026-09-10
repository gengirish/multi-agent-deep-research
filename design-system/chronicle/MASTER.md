# Design System Master File

> **SOURCE OF TRUTH:** `frontend/src/App.css` is the token layer. This file
> documents it; it does not define it. If the two disagree, App.css wins and
> this file is stale — fix it here.
>
> When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this file.

---

**Project:** Chronicle
**Category:** SaaS — AI research copilot
**Last reconciled against code:** 2026-09-10

---

## How the palette is structured

Chronicle ships **two complete palettes** (dark default, light via
`[data-theme="light"]`), and the light one is **not a mechanical inversion**.
Three things change character between them, which is the single most important
thing to understand before touching color:

1. **Elevated surfaces flip from translucent to opaque.** On dark,
   `--c-surface-*` are white washes that lift a surface off the background. A
   white wash over white is invisible, so on light they become solid slate
   tints that get *darker* as they rise — the opposite direction.
2. **Text darkens past the naive mirror.** The muted greys that read fine on
   dark fail WCAG AA on white. Body text on light is `#334155` (~10:1).
3. **Accents deepen.** `#818cf8` carries a dark ground but reaches only ~2.6:1
   on white, so light mode uses the 500/600 steps.

**The rule this implies:** components pick a surface step by **meaning** ("how
raised is this?"), never by copying an alpha value. Hardcoding
`rgba(255,255,255,0.03)` is what breaks light mode.

### Brand accents

| Role | Dark | Light | Token |
|------|------|-------|-------|
| Accent | `#818cf8` | `#4f46e5` | `--c-accent` |
| Accent 2 | `#38bdf8` | `#0369a1` | `--c-accent-2` |
| Accent strong | `#6366f1` | `#4338ca` | `--c-accent-strong` |
| Accent deep | `#0ea5e9` | `#0369a1` | `--c-accent-deep` |

Brand gradient: indigo → sky, via `--c-gradient-brand` (surfaces) and
`--c-gradient-brand-text` (clipped text). Never rebuild these inline.

### Surfaces and text

Elevation ladder `--c-surface-1` … `--c-surface-7`. App chrome (sidebar, top
bar) uses `--c-bg-chrome`; sunken wells (code blocks, dialog bodies) use
`--c-bg-sunken`. Text runs `--c-text-strong` / `--c-text` / `--c-text-subtle` /
`--c-text-muted` / `--c-text-dim`, plus `--c-text-on-accent`.

Borders are `--c-border` / `--c-border-hi`, with `--c-border-focus` reserved
for focus rings. On light these are **solid**, not alpha — an alpha-white
border is invisible on white.

### Semantic colors

`--c-success`, `--c-warning`, `--c-error`, `--c-info`, each with matching
`-text`, `-bg` and `-border` variants. Use the trio together rather than
tinting a semantic hue by hand.

---

## Typography

- **Headings & body:** Plus Jakarta Sans, via `var(--font-jakarta)` with a
  `var(--font-inter)` → Inter → system fallback chain.
- **Mono:** JetBrains Mono, via `var(--font-jetbrains-mono)`.
- Fonts are loaded through `next/font` in `frontend/app/layout.tsx`. Do **not**
  add a Google Fonts `@import` — it would fetch a second copy and cost a
  render-blocking round trip.

---

## Spacing

There is **no `--space-*` token scale** in this codebase. Spacing is written as
literal `rem`/`px` values in component CSS. Do not write `var(--space-md)` —
it resolves to nothing.

If a scale is wanted later, it must be added to `App.css` first, then adopted;
until then, follow the values already used by neighbouring components
(commonly `4 / 8 / 12 / 14 / 18 / 20 / 24px`).

---

## Motion and accessibility

- Every animation must have a `@media (prefers-reduced-motion: reduce)` escape.
  27 stylesheets already honor this; a new one without it is a regression.
- Interactive controls carry a visible `:focus-visible` ring built from
  `--c-border-focus`.
- Touch targets: `min-height` of at least 34px on compact controls, 44px on
  primary actions.
- Live regions (`aria-live`) must not contain per-second updates — a ticking
  clock inside one drowns out the messages that matter. Mark such elements
  `aria-hidden` and let the semantic text carry the meaning.
- Light-mode text tokens are chosen to clear 4.5:1 on `--c-bg`. Introducing a
  new light-mode text color means checking that ratio.

---

## Components

Component CSS lives next to the component (`Foo.tsx` + `Foo.css`) and consumes
tokens only. Buttons, cards, inputs and dialogs already have established
treatments in `App.css` and the per-component files — read the nearest existing
example before inventing a new one.
