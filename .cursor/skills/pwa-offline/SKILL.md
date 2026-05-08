---
name: pwa-offline
description: PWA configuration, service worker patterns, offline support, and mobile installability for LocalFlash. Use when working with PWA features (F12 push, F26 offline-first), service workers, app manifest, offline pages, or mobile install prompts. Critical for the Tier-2 India use case where 3G drops at the counter must not break the claim flow.
---

# LocalFlash — PWA (Progressive Web App)

> Patterns ported from a sister Next.js project. When applying to LocalFlash, rename `medforce-*` references to `localflash-*`, swap pharma colors for LocalFlash brand tokens, and adapt the offline cache list to consumer offer cards + claim codes.

## Architecture

LocalFlash is a server-rendered Next.js 14 app with a lightweight PWA layer for installability and offline resilience. It is NOT a static export — server actions and SSR remain the primary data strategy.

```
app/manifest.ts              → Web App Manifest (dynamic, TypeScript)
app/offline/page.tsx          → Offline fallback page
public/sw.js                  → Service worker (vanilla JS, no build tooling)
public/icons/                 → SVG app icons (192, 512, maskable)
components/pwa/               → Client components (SW registration)
```

## Manifest (`app/manifest.ts`)

Uses Next.js built-in `MetadataRoute.Manifest` type. Returns:
- `name`: "LocalFlash — Offers Near You"
- `short_name`: "LocalFlash"
- `display`: "standalone" (no browser chrome)
- `orientation`: "portrait"
- `theme_color`: see brand tokens
- `background_color`: see brand tokens
- Icons: 192x192, 512x512, maskable 512x512 (all SVG)

## Service Worker (`public/sw.js`)

Plain JavaScript, no Workbox or build plugins. Three caching strategies:

| Request Type | Strategy | Fallback |
|-------------|----------|----------|
| Static assets (`/icons/`, `/_next/static/`, fonts, images) | Cache-first | Network |
| Navigation (page loads) | Network-first | `/offline` page |
| API / data requests | Network-only | None (let client handle errors) |

### Cache Versioning

Cache name: `localflash-v1`. Bump the version to invalidate old caches on deploy. Old caches are deleted in the `activate` event.

### Precached URLs

Only `/offline` is precached on install. Static assets are cached lazily on first fetch.

## SW Registration (`components/pwa/ServiceWorkerRegistration.tsx`)

Client component, renders `null`. Registers `/sw.js` on mount. Listens for `updatefound` to detect new versions.

## Offline Page (`app/offline/page.tsx`)

Client-rendered page with:
- `WifiOff` icon (lucide-react)
- "You're Offline" heading
- "Try Again" button that reloads the page
- LocalFlash branding colors

## Root Layout PWA Meta

In `app/layout.tsx`:
- `metadata.appleWebApp`: `capable: true`, `statusBarStyle: "default"`, `title: "LocalFlash"`
- `viewport`: theme color, no user scaling, `viewportFit: "cover"` for notch devices
- `<head>`: favicon and apple-touch-icon pointing to SVG icons

## next.config.ts PWA Headers

- `/sw.js`: `Cache-Control: no-cache` + `Service-Worker-Allowed: /`
- `/manifest.webmanifest`: `Content-Type: application/manifest+json`

## Key Rules

1. **Service worker is vanilla JS** — no TypeScript, no build step, lives in `public/`
2. **Never cache API responses** in SW — let TanStack Query handle data caching
3. **Navigation failures** always fall back to `/offline` — never show browser error
4. **Bump `CACHE_NAME` version** on every deploy that changes static assets
5. **SVG icons** — no PNG generation needed, SVGs scale to any size
6. **No `output: 'export'`** — LocalFlash uses SSR, server actions, and API routes
7. **Test installability** at `chrome://flags/#bypass-installable-check` during dev

## LocalFlash-Specific Enhancements (per YC_FEATURES.md)

- **F12 Push notifications**: Web Push API + VAPID keys, geo-triggered when a new offer drops within 1 km of last-known consumer location.
- **F26 Offline-first**: cache last 50 viewed offer cards + store profiles in `localflash-offers-v1`; queue claim creations in IndexedDB and sync via background-sync when network returns. Claim code stays valid even if connection drops at the counter (verified server-side later).
- **Geo-permission UX**: request location once with a friction-free explanation, persist to `ConsumerLocation`. Skip on first-visit bounces.
- **Capacitor wrapper for Play Store** is a Phase 4+ consideration — do not pursue pre-YC.
