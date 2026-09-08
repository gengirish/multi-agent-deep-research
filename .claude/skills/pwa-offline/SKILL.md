---
name: pwa-offline
description: PWA configuration, service worker patterns, offline support, and mobile installability for the Chronicle Next.js frontend. Use when working on service workers, the app manifest, the offline fallback page, cache versioning on deploy, install prompts, or "the app doesn't work offline / won't install" bug reports.
---

# Chronicle — PWA (Progressive Web App)

Chronicle's frontend is a server-rendered Next.js 14 app (`frontend/`) with a lightweight PWA layer for installability and offline resilience. It is NOT a static export — server actions, SSR, and API routes remain the primary data strategy, so never add `output: 'export'`.

## Architecture

```
frontend/app/manifest.ts                             → Web App Manifest (dynamic, TypeScript)
frontend/app/offline/page.tsx                        → Offline fallback page
frontend/public/sw.js                                → Service worker (vanilla JS, no build tooling)
frontend/public/icons/                               → App icons (PNG 192/512 + maskable, SVG fallback)
frontend/src/components/pwa/ServiceWorkerRegistration.tsx → Client registration component
frontend/next.config.mjs                             → PWA headers
```

## Manifest (`app/manifest.ts`)

Uses Next.js's built-in `MetadataRoute.Manifest` type. Current values:

- `name`: "Chronicle — AI research copilot for founders", `short_name`: "Chronicle"
- `display`: `"standalone"`, with `display_override: ["standalone", "minimal-ui"]`
- `orientation`: `"portrait"`, `start_url`: `/?source=pwa`, `scope`: `/`
- `theme_color`: `#0f172a`, `background_color`: `#0b1220`
- `categories`: business, productivity, research
- Icons: **PNG first** (192, 512, maskable 192, maskable 512) for broad iOS/Android launcher support, with `icon-512.svg` at `sizes: "any"` as a crisp Chromium fallback
- `shortcuts`: New research (`/research`), History (`/history`), Audience (`/audience`) — each tagged `?source=pwa-shortcut`

When adding a shortcut, keep the `?source=pwa-shortcut` query param so install-surface traffic stays attributable.

## Service Worker (`public/sw.js`)

Plain JavaScript, no Workbox or build plugins. It bails out early on non-GET requests, on cross-origin requests (the Fly backend, OpenRouter, font CDNs), and on anything under `/api/`.

| Request type | Strategy | Fallback |
|---|---|---|
| Static assets (`/_next/static/`, `/icons/`, `.css`, `.js`, `.woff2`, `.png`, `.svg`) | Cache-first | Network, cached on success |
| Page navigations | Network-first, successful pages cached | Cached page → `/offline` → plain-text 503 |
| `/api/*` and cross-origin | Not intercepted | Client owns the error |

### Cache versioning

Cache name is `chronicle-vN` (currently `chronicle-v10`). **Bump the version on every deploy that changes static assets** — the `activate` handler deletes every cache whose key isn't the current `CACHE_NAME`, which is the only invalidation mechanism here.

### Precached URLs

`PRECACHE_URLS` covers the app shell entry (`/`), `/offline`, `/favicon.svg`, and the core icons, added with `Promise.allSettled` so one missing asset can't fail the whole install. Everything else is cached lazily on first fetch.

### `message` handler

Listens for a skip-waiting message so a newly installed worker can take over without a second reload.

## SW registration (`src/components/pwa/ServiceWorkerRegistration.tsx`)

Client component that renders no visible layout of its own. Registers `/sw.js` on mount and listens for `updatefound` to surface a new version.

## Offline page (`app/offline/page.tsx`)

Client-rendered fallback: offline icon, "You're offline" heading, a retry button that reloads, and Chronicle branding. It must stay self-contained — no data fetching, since it renders precisely when the network is gone.

## Root layout PWA meta (`app/layout.tsx`)

- `metadata.appleWebApp`: `capable: true`, `statusBarStyle: "default"`, `title: "Chronicle"`
- `viewport`: theme color, no user scaling, `viewportFit: "cover"` for notch devices
- `<head>`: favicon and apple-touch-icon

## PWA headers (`next.config.mjs`)

- `/sw.js`: `Cache-Control: no-cache` + `Service-Worker-Allowed: /`
- `/manifest.webmanifest`: `Content-Type: application/manifest+json`

## Key rules

1. **The service worker is vanilla JS** — no TypeScript, no build step, lives in `public/`.
2. **Never cache API responses** in the SW. Research jobs, job polling, and newsletter state must stay live.
3. **Never intercept cross-origin requests** — the Fly backend and model providers must pass through untouched.
4. **Navigation failures** fall back to a cached page, then `/offline` — never a browser error screen.
5. **Bump `CACHE_NAME`** on every deploy that changes static assets.
6. **No `output: 'export'`** — Chronicle relies on SSR, server actions, and API routes.
7. **Test installability** at `chrome://flags/#bypass-installable-check` during local dev.

## Chronicle-specific considerations

- Research runs take 30–90 seconds and are polled from the backend, so they are inherently online-only. Don't try to queue or resume a run from the service worker; surface a clear offline state instead.
- Previously viewed report pages are cached by the navigation handler as a side effect, so a founder can reread a report offline. That's the intended offline value — not offline research.
- Newsletter and broadcast actions hit `/api/*` and are deliberately never cached; a failed broadcast must fail loudly rather than replay later.
