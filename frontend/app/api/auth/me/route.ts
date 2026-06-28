import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { serverError } from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await getSession();
    // Anonymous is not an error — the client treats this as "not signed in"
    // and renders accordingly. Returning 401 with a `user: null` body lets
    // the frontend distinguish "no session" from "server broken" cleanly.
    if (!session) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      include: {
        memberships: {
          take: 1,
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const membership = user.memberships[0];

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        orgId: membership?.organizationId ?? null,
        orgRole: membership?.role ?? null,
      },
    });
  } catch (err) {
    return serverError(err, "me");
  }
}
