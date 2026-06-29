import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  deleteSubscriber,
  isNewsletterAdmin,
  GLOBAL_NEWSLETTER_OWNER_ID,
} from "@/lib/subscribers";
import { errorResponse, serverError } from "@/lib/api-utils";

export const runtime = "nodejs";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession();
    if (!session?.sub) {
      return errorResponse("Sign in to remove subscribers.", 401);
    }
    if (!isNewsletterAdmin(session.email)) {
      return errorResponse("You don't have access to the newsletter list.", 403);
    }

    const id = (params.id ?? "").trim();
    if (!id || id.length > 64) {
      return errorResponse("Invalid subscriber id.", 400);
    }

    const removed = await deleteSubscriber(GLOBAL_NEWSLETTER_OWNER_ID, id);
    if (!removed) {
      return errorResponse("Subscriber not found.", 404);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err, "DELETE /api/subscribers/:id");
  }
}
