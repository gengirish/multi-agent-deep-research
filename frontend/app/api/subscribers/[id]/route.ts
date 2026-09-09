import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  deleteSubscriber,
  setSubscriberTags,
  isNewsletterAdmin,
  GLOBAL_NEWSLETTER_OWNER_ID,
} from "@/lib/subscribers";
import { updateSubscriberSchema } from "@/lib/validations";
import { errorResponse, serverError } from "@/lib/api-utils";

export const runtime = "nodejs";

/** Shared auth + id checks for both handlers on this route. */
async function authorize(
  rawId: string,
): Promise<{ id: string } | { error: ReturnType<typeof errorResponse> }> {
  const session = await getSession();
  if (!session?.sub) {
    return { error: errorResponse("Sign in to manage subscribers.", 401) };
  }
  if (!isNewsletterAdmin(session.email)) {
    return {
      error: errorResponse("You don't have access to the newsletter list.", 403),
    };
  }
  const id = (rawId ?? "").trim();
  if (!id || id.length > 64) {
    return { error: errorResponse("Invalid subscriber id.", 400) };
  }
  return { id };
}

/** Replace a subscriber's segment tags. */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await authorize(params.id);
    if ("error" in auth) return auth.error;

    const body = await req.json().catch(() => null);
    const parsed = updateSubscriberSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues[0]?.message ?? "Invalid input",
        400,
      );
    }

    const subscriber = await setSubscriberTags(
      GLOBAL_NEWSLETTER_OWNER_ID,
      auth.id,
      parsed.data.tags,
    );
    if (!subscriber) {
      return errorResponse("Subscriber not found.", 404);
    }

    return NextResponse.json({ subscriber });
  } catch (err) {
    return serverError(err, "PATCH /api/subscribers/:id");
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await authorize(params.id);
    if ("error" in auth) return auth.error;

    const removed = await deleteSubscriber(GLOBAL_NEWSLETTER_OWNER_ID, auth.id);
    if (!removed) {
      return errorResponse("Subscriber not found.", 404);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err, "DELETE /api/subscribers/:id");
  }
}
