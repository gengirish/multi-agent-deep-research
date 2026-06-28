import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signJWT, setAuthCookie } from "@/lib/auth";
import { signInSchema } from "@/lib/validations";
import { errorResponse, serverError, getClientIp } from "@/lib/api-utils";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    if (!rateLimit(ip, 5, 60000)) {
      return errorResponse("Too many login attempts. Try again in a minute.", 429);
    }

    const body = await req.json();
    const parsed = signInSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid email or password", 400);
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          take: 1,
          include: { organization: true },
        },
      },
    });

    // Same error for "no such user" and "wrong password" — don't leak which
    // half failed; that's a classic credential-stuffing oracle.
    if (!user) {
      return errorResponse("Invalid email or password", 401);
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return errorResponse("Invalid email or password", 401);
    }

    const membership = user.memberships[0];
    if (!membership) {
      return errorResponse(
        "Your account isn't attached to a workspace. Contact support.",
        403
      );
    }

    const token = await signJWT({
      userId: user.id,
      email: user.email,
      name: user.name,
      orgId: membership.organizationId,
      orgRole: membership.role,
      tokenVersion: user.tokenVersion,
    });

    const response = NextResponse.json({
      userId: user.id,
      email: user.email,
      name: user.name,
      orgId: membership.organizationId,
    });
    setAuthCookie(response, token);
    return response;
  } catch (err) {
    return serverError(err, "login");
  }
}
