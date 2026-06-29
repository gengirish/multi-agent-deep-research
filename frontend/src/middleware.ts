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
  // Public newsletter sign-up form (landing + shared report pages).
  "/api/subscribe",
];

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
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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

interface ChronicleClaims {
  sub?: string;
  email?: string;
  name?: string;
  orgId?: string;
  orgRole?: string;
}

function applyClaimsToHeaders(
  headers: Headers,
  payload: ChronicleClaims,
): void {
  if (payload.sub) headers.set("x-user-id", payload.sub);
  if (payload.email) headers.set("x-user-email", payload.email);
  if (payload.name) headers.set("x-user-name", payload.name);
  if (payload.orgId) headers.set("x-user-org-id", payload.orgId);
  if (payload.orgRole) headers.set("x-user-org-role", payload.orgRole);
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
    return NextResponse.next();
  }

  // Token present — try to verify. We need the secret regardless of
  // whether the route is gated, because verified claims power the
  // downstream `x-user-*` headers (used by /api/auth/me, etc.).
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
    const { payload } = await jwtVerify(token, secret);
    const requestHeaders = new Headers(request.headers);
    applyClaimsToHeaders(requestHeaders, payload as ChronicleClaims);
    return NextResponse.next({ request: { headers: requestHeaders } });
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
      const response = NextResponse.next();
      response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
      return response;
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
