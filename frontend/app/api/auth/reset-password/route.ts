import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, clearAuthCookie } from "@/lib/auth";
import { consumeToken } from "@/lib/auth-email";
import { resetPasswordSchema } from "@/lib/validations";
import { errorResponse, serverError, getClientIp } from "@/lib/api-utils";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    if (!rateLimit(ip, 3, 60000)) {
      return errorResponse("Too many requests", 429);
    }

    const body = await req.json();
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    const { email, token, password } = parsed.data;

    const record = await consumeToken(email, token, "PASSWORD_RESET");
    if (!record) {
      return errorResponse("Invalid or expired reset link", 400);
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // consumeToken succeeded but the user vanished — treat as expired link
      // rather than confirming the token was real for an unknown identifier.
      return errorResponse("Invalid or expired reset link", 400);
    }

    const newHash = await hashPassword(password);

    // Bumping tokenVersion invalidates every outstanding JWT for this user.
    // Middleware compares payload.tokenVersion to the persisted value; if it
    // can't reach Prisma from the edge, clearing the cookie below is the
    // belt-and-braces fallback for this device.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        tokenVersion: { increment: 1 },
      },
    });

    const response = NextResponse.json({ message: "Password reset successfully" });
    clearAuthCookie(response);
    return response;
  } catch (err) {
    return serverError(err, "reset-password");
  }
}
