import { hash, compare } from "bcryptjs";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = "7d";
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export const COOKIE_NAME = "chronicle-session";

export type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

export interface SessionPayload extends JWTPayload {
  sub: string;
  email: string;
  name: string;
  orgId?: string;
  orgRole?: OrgRole;
  tokenVersion: number;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(password, passwordHash);
}

export async function signJWT(payload: {
  userId: string;
  email: string;
  name: string;
  orgId?: string;
  orgRole?: OrgRole;
  tokenVersion?: number;
}): Promise<string> {
  const body: Record<string, unknown> = {
    email: payload.email,
    name: payload.name,
    tokenVersion: payload.tokenVersion ?? 0,
  };
  if (payload.orgId) body.orgId = payload.orgId;
  if (payload.orgRole) body.orgRole = payload.orgRole;

  return new SignJWT(body)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifyJWT(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export function setAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// Reads identity headers injected by middleware after it has already
// validated the JWT (signature + expiry + tokenVersion). Callers can trust
// these without re-verifying.
export async function getSessionFromHeaders(): Promise<SessionPayload | null> {
  const hdrs = await headers();
  const userId = hdrs.get("x-user-id");
  const email = hdrs.get("x-user-email");
  const name = hdrs.get("x-user-name");
  if (!userId || !email || !name) return null;

  const orgId = hdrs.get("x-user-org-id") ?? undefined;
  const orgRoleRaw = hdrs.get("x-user-org-role");
  const orgRole: OrgRole | undefined =
    orgRoleRaw === "OWNER" || orgRoleRaw === "ADMIN" || orgRoleRaw === "MEMBER"
      ? orgRoleRaw
      : undefined;

  return {
    sub: userId,
    email,
    name,
    orgId,
    orgRole,
    tokenVersion: 0,
  };
}

export async function getSession(): Promise<SessionPayload | null> {
  const fromHeaders = await getSessionFromHeaders();
  if (fromHeaders?.sub) return fromHeaders;

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyJWT(token);
}

export async function getAuthUser(): Promise<User | null> {
  const session = await getSession();
  if (!session?.sub) return null;
  // Lazy-load the Prisma client so route handlers that only need session
  // identity don't pay the connection-pool init cost.
  const { prisma } = await import("./prisma");
  return prisma.user.findUnique({ where: { id: session.sub } });
}
