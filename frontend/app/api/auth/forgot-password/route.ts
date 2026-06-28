import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/auth-email";
import { forgotPasswordSchema } from "@/lib/validations";
import { errorResponse, serverError, getClientIp } from "@/lib/api-utils";
import { rateLimit } from "@/lib/rate-limit";

const GENERIC_RESPONSE = {
  message: "If an account exists for this email, a reset link has been sent.",
};

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    if (!rateLimit(ip, 3, 60000)) {
      return errorResponse("Too many requests. Try again in a minute.", 429);
    }

    const body = await req.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      // Even validation failures could leak info via timing, but a clear 400
      // here is fine — an attacker probing "is foo@bar.com registered" gets
      // the same generic body on the happy path regardless.
      return errorResponse("Valid email is required", 400);
    }

    const { email } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      try {
        await sendPasswordResetEmail(email, user.name);
      } catch (e) {
        // Swallow email-send failures so the response shape (and timing) stay
        // identical to the not-found case; we don't want to expose enumeration
        // via error responses.
        console.error("Failed to send password reset email:", e);
      }
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (err) {
    return serverError(err, "forgot-password");
  }
}
