import { NextResponse } from "next/server";

export function errorResponse(
  message: string,
  status: number = 400,
): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

// Logs full error with context for ops visibility, but only returns a
// generic message to the client to avoid leaking stack traces / Prisma
// internals / secret paths.
export function serverError(err: unknown, context: string): NextResponse {
  // eslint-disable-next-line no-console
  console.error(`[${context}]`, err);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) {
    const trimmed = real.trim();
    if (trimmed) return trimmed;
  }
  return "unknown";
}
