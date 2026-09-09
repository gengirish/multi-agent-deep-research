import { NextResponse } from "next/server";
import { publicSubscribeSchema } from "@/lib/validations";
import {
  addPublicSubscriber,
  buildConfirmUrl,
  isDoubleOptInEnabled,
} from "@/lib/subscribers";
import { sendSubscribeConfirmationEmail } from "@/lib/subscriber-email";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse, serverError, getClientIp } from "@/lib/api-utils";

export const runtime = "nodejs";

// Public, unauthenticated endpoint — guard purely by IP so a script can't
// flood the list. Generous enough for a human filling the form a couple times.
const PER_IP_LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

// One message for every outcome that isn't an outright error.
//
// This is deliberate. Saying "you're already subscribed" would turn the
// endpoint into an oracle for whether a given address is on the list, which is
// exactly the probe a scraper wants. Pending, already-active and re-subscribing
// addresses all get the same sentence; only the recipient's own inbox reveals
// which one happened.
const CONFIRM_MESSAGE =
  "Almost there — check your inbox and click the confirmation link.";

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
    const parsed = publicSubscribeSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues[0]?.message ?? "Enter a valid email.",
        400,
      );
    }

    const { email, name, source } = parsed.data;
    const result = await addPublicSubscriber(email, name, {
      source: source ?? "landing",
    });

    if (result.outcome === "pending" && result.confirmToken) {
      const sent = await sendSubscribeConfirmationEmail(
        email,
        result.confirmToken,
        result.subscriber.name,
      );
      if (!sent) {
        // AgentMail unconfigured (local dev / preview without secrets). Surface
        // the link on the server console so the flow stays completable — never
        // in the response, which is public.
        // eslint-disable-next-line no-console
        console.log(
          `\n=== [DEV] SUBSCRIBE CONFIRM LINK ===\nTo: ${email}\n${buildConfirmUrl(result.confirmToken)}\n====================================\n`,
        );
      }
    }

    // Double opt-in off (dev escape hatch) means the address is already live,
    // so telling them to check their inbox would be a lie.
    if (result.outcome === "confirmed") {
      return NextResponse.json({
        ok: true,
        pending: false,
        message: "You're subscribed — watch your inbox for the next briefing.",
      });
    }

    return NextResponse.json({
      ok: true,
      pending: true,
      message: CONFIRM_MESSAGE,
    });
  } catch (err) {
    return serverError(err, "POST /api/subscribe");
  }
}
