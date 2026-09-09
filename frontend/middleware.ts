import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "chronicle-session";

/**
 * Routes that anyone (signed-in or anonymous) can hit. Anonymous research
 * is the Chronicle demo experience, so the public surface is generous —
 * only personal history + conversation APIs are actually gated.
 */
const PUBLIC_PATHS = [
  "/",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/research",
  "/about",
  "/newsletter",
  "/settings",
  "/offline",
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon.svg",
  "/og-image.svg",
];

const PUBLIC_PATH_PREFIXES = ["/r/", "/icons/", "/_next/"];

const PUBLIC_API_PREFIXES = [
  "/api/auth/",
  "/api/health",
  "/api/demo-queries",
  "/api/research/jobs",
  "/api/research-stream",
  "/api/research-voice",
  "/api/research",
  "/api/export/",
  "/api/search",
  "/api/rag/",
  // Recipients clicking unsubscribe are anonymous — must stay public.
  "/api/unsubscribe",
  // Double opt-in confirmation, clicked straight out of a mail client.
  "/api/subscribe/confirm",
];

/**
 * Public API routes matched exactly rather than by prefix.
 *
 * `/api/subscribe` has to be here, not in the prefix list: as a prefix it would
 * also match `/api/subscribers`, quietly making the owner-only subscriber CRUD
 * routes "public" as far as middleware is concerned. Those handlers enforce
 * their own session + admin checks, so nothing was ever exposed, but the
 * overlap is a trap for the next route added under that name.
 */
const PUBLIC_API_EXACT = ["/api/subscribe"];

/**
 * Pages that require auth. Anonymous hits redirect to /sign-in?redirect=...
 */
const GATED_PATHS = ["/history", "/audience"];

/**
 * API routes that require auth. Anonymous hits return 401 JSON.
 */
const GATED_API_PREFIXES = ["/api/conversations"];

function isPublicExact(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

function isPublicPrefix(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isPublicApi(pathname: string): boolean {
  return (
    PUBLIC_API_EXACT.includes(pathname) ||
    PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function isGatedPage(pathname: string): boolean {
  return GATED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isGatedApi(pathname: string): boolean {
  return GATED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Lazy-evaluated JWT secret. The Edge runtime cannot read non-public
 * env vars at module top-level, so we resolve it inside the handler.
 */
function getJwtSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

/**
 * Identity headers this middleware refuses to forward.
 *
 * Nothing downstream reads these any more — `getSession()` verifies the session
 * cookie itself — but they were previously trusted as an authenticated identity,
 * and a client can set them freely. Stripping them on the way in means a future
 * reader of `x-user-*` cannot silently reintroduce that hole.
 */
const SPOOFABLE_IDENTITY_HEADERS = [
  "x-user-id",
  "x-user-email",
  "x-user-name",
  "x-user-org-id",
  "x-user-org-role",
];

function withIdentityHeadersStripped(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  let found = false;
  for (const name of SPOOFABLE_IDENTITY_HEADERS) {
    if (headers.has(name)) {
      headers.delete(name);
      found = true;
    }
  }
  // Only pay for a rewritten request when there was something to remove.
  return found
    ? NextResponse.next({ request: { headers } })
    : NextResponse.next();
}

function unauthorizedJson(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function redirectToSignIn(request: NextRequest, clearCookie: boolean) {
  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set(
    "redirect",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  const response = NextResponse.redirect(signInUrl);
  if (clearCookie) {
    response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isApi = pathname.startsWith("/api/");
  const isGatedPageRoute = !isApi && isGatedPage(pathname);
  const isGatedApiRoute = isApi && isGatedApi(pathname);
  const isPublic = isApi
    ? isPublicApi(pathname) && !isGatedApiRoute
    : (isPublicExact(pathname) || isPublicPrefix(pathname)) &&
      !isGatedPageRoute;

  const token = request.cookies.get(COOKIE_NAME)?.value;

  // Anonymous user hitting a gated route → bounce immediately.
  if (!token) {
    if (isGatedApiRoute) return unauthorizedJson();
    if (isGatedPageRoute) return redirectToSignIn(request, false);
    return withIdentityHeadersStripped(request);
  }

  // Token present — verify it so an expired or forged cookie is evicted rather
  // than left to fail on every subsequent request.
  const secret = getJwtSecret();
  if (!secret) {
    console.error("JWT_SECRET not configured");
    if (isGatedApiRoute) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }
    return NextResponse.next();
  }

  try {
    // Verified only to decide whether a gated route may proceed. The claims are
    // deliberately NOT forwarded downstream — route handlers call getSession(),
    // which re-verifies the cookie itself.
    await jwtVerify(token, secret);
    return withIdentityHeadersStripped(request);
  } catch {
    // Invalid / expired token. For gated routes we evict the cookie
    // and bounce to sign-in; for everything else we silently fall
    // through as anonymous so the public demo keeps working.
    if (isGatedApiRoute) {
      const response = unauthorizedJson();
      response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
      return response;
    }
    if (isGatedPageRoute) {
      return redirectToSignIn(request, true);
    }
    if (isPublic || isApi) {
      // Public route with bad cookie — clear it to stop hammering verify
      // on every request, but still allow the request through.
      const response = withIdentityHeadersStripped(request);
      response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
      return response;
    }
    return withIdentityHeadersStripped(request);
  }
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
