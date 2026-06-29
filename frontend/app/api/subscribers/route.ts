import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addSubscriberSchema } from "@/lib/validations";
import {
  listSubscribers,
  addSubscriber,
  isNewsletterAdmin,
  GLOBAL_NEWSLETTER_OWNER_ID,
} from "@/lib/subscribers";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse, serverError } from "@/lib/api-utils";

export const runtime = "nodejs";

// Per-user cap on how fast a signed-in user can grow their list — keeps a
// runaway script (or paste-bombing the add form) from hammering the DB.
const PER_USER_LIMIT = 60;
const WINDOW_MS = 5 * 60 * 1000;

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.sub) {
      return errorResponse("Sign in to view subscribers.", 401);
    }
    if (!isNewsletterAdmin(session.email)) {
      return errorResponse("You don't have access to the newsletter list.", 403);
    }

    const subscribers = await listSubscribers(GLOBAL_NEWSLETTER_OWNER_ID);
    return NextResponse.json({ subscribers });
  } catch (err) {
    return serverError(err, "GET /api/subscribers");
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.sub) {
      return errorResponse("Sign in to add subscribers.", 401);
    }
    if (!isNewsletterAdmin(session.email)) {
      return errorResponse("You don't have access to the newsletter list.", 403);
    }

    if (
      !rateLimit(`subscribers:add:user:${session.sub}`, PER_USER_LIMIT, WINDOW_MS)
    ) {
      return errorResponse(
        "You've hit the add limit. Try again in a few minutes.",
        429,
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = addSubscriberSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues[0]?.message ?? "Invalid input",
        400,
      );
    }

    const { subscriber, created } = await addSubscriber(
      GLOBAL_NEWSLETTER_OWNER_ID,
      parsed.data.email,
      parsed.data.name,
    );

    return NextResponse.json(
      { subscriber, created },
      { status: created ? 201 : 200 },
    );
  } catch (err) {
    return serverError(err, "POST /api/subscribers");
  }
}
