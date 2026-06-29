import { NextResponse } from "next/server";
import { addSubscriberSchema } from "@/lib/validations";
import { addPublicSubscriber } from "@/lib/subscribers";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse, serverError, getClientIp } from "@/lib/api-utils";

export const runtime = "nodejs";

// Public, unauthenticated endpoint — guard purely by IP so a script can't
// flood the list. Generous enough for a human filling the form a couple times.
const PER_IP_LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    if (!rateLimit(`subscribe:ip:${ip}`, PER_IP_LIMIT, WINDOW_MS)) {
      return errorResponse(
        "Too many attempts. Please try again in a few minutes.",
        429,
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = addSubscriberSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues[0]?.message ?? "Enter a valid email.",
        400,
      );
    }

    const { created } = await addPublicSubscriber(
      parsed.data.email,
      parsed.data.name,
    );

    // Don't leak whether the email was already on the list beyond a soft flag —
    // both cases are a success from the visitor's perspective.
    return NextResponse.json({
      ok: true,
      created,
      message: created
        ? "You're subscribed — watch your inbox for the next briefing."
        : "You're already on the list.",
    });
  } catch (err) {
    return serverError(err, "POST /api/subscribe");
  }
}
