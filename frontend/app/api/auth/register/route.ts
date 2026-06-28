import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, signJWT, setAuthCookie } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/auth-email";
import { signUpSchema } from "@/lib/validations";
import { errorResponse, serverError, getClientIp } from "@/lib/api-utils";
import { rateLimit } from "@/lib/rate-limit";

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "workspace";
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    if (!rateLimit(ip, 5, 60000)) {
      return errorResponse("Too many requests", 429);
    }

    const body = await req.json();
    const parsed = signUpSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    const { email, password, name } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return errorResponse("An account with this email already exists", 409);
    }

    const passwordHash = await hashPassword(password);

    // Random 6-hex suffix keeps the slug unique even when two users share a
    // display name; the unique constraint on Organization.slug will still
    // throw on the astronomical chance of a collision and bubble out via
    // serverError below.
    const slug = `${slugify(name)}-${randomBytes(3).toString("hex")}`;

    const { user, org } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          emailVerified: false,
        },
      });
      const org = await tx.organization.create({
        data: {
          name: `${name}'s workspace`,
          slug,
        },
      });
      await tx.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: "OWNER",
        },
      });
      return { user, org };
    });

    try {
      await sendVerificationEmail(email, name);
    } catch (e) {
      console.error("Failed to send verification email:", e);
    }

    const token = await signJWT({
      userId: user.id,
      email: user.email,
      name: user.name,
      orgId: org.id,
      orgRole: "OWNER",
      tokenVersion: 0,
    });

    const response = NextResponse.json(
      { message: "Account created", userId: user.id, orgId: org.id },
      { status: 201 }
    );
    setAuthCookie(response, token);
    return response;
  } catch (err) {
    return serverError(err, "register");
  }
}
