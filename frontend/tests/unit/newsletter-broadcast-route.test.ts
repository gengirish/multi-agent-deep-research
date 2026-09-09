import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";

// Env must be set before the route (and the subscribers module, which reads
// NEWSLETTER_ADMIN_EMAILS at import time) is loaded, so the route is pulled in
// dynamically in beforeAll rather than imported at the top.
process.env.NEWSLETTER_ADMIN_EMAILS = "admin@chronicle.test";
process.env.CHRONICLE_SERVICE_TOKEN = "test-service-token-0123456789abcdef";
process.env.NEXT_PUBLIC_APP_URL = "https://chronicle.test";

const getSession = vi.fn();
const sendEmail = vi.fn();
const findMany = vi.fn();
const broadcastFindFirst = vi.fn();
const broadcastCreate = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession }));
vi.mock("@/lib/agentmail", () => ({ sendEmail }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriber: { findMany },
    broadcast: { findFirst: broadcastFindFirst, create: broadcastCreate },
  },
}));
// Rate limiting is not under test, and its bucket state is module-global —
// leaving it live would make the fifth send in this file fail.
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => true }));

let POST: (req: Request) => Promise<Response>;

const SUBSCRIBERS = [
  { id: "s1", email: "a@example.com", name: "A", unsubscribeToken: "tok-aaa" },
  { id: "s2", email: "b@example.com", name: "B", unsubscribeToken: "tok-bbb" },
];

const VALID_BODY = {
  subject: "IntelliForge Morning Briefing",
  html: "<html><body><h1>Today in AI</h1></body></html>",
  text: "Today in AI",
  dedupeKey: "daily-briefing:2026-09-09",
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("https://chronicle.test/api/newsletter/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

const BEARER = {
  authorization: `Bearer ${process.env.CHRONICLE_SERVICE_TOKEN}`,
};

beforeAll(async () => {
  ({ POST } = await import("@/app/api/newsletter/broadcast/route"));
});

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(null);
  findMany.mockResolvedValue(SUBSCRIBERS);
  broadcastFindFirst.mockResolvedValue(null);
  broadcastCreate.mockResolvedValue({ id: "b1" });
  sendEmail.mockResolvedValue(true);
});

describe("POST /api/newsletter/broadcast", () => {
  it("401s with neither a session nor a service token", async () => {
    const res = await post(VALID_BODY);
    expect(res.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("401s when the bearer token is wrong", async () => {
    const res = await post(VALID_BODY, { authorization: "Bearer nope-nope" });
    expect(res.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("403s an authenticated user who is not a newsletter admin", async () => {
    getSession.mockResolvedValue({
      sub: "u1",
      email: "someone@example.com",
      name: "Someone",
    });
    const res = await post(VALID_BODY);
    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("accepts a valid service bearer token without a session", async () => {
    const res = await post(VALID_BODY, BEARER);
    expect(res.status).toBe(200);
    expect(getSession).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ ok: true, sentCount: 2 });
  });

  it("400s on an invalid dedupeKey", async () => {
    const res = await post(
      { ...VALID_BODY, dedupeKey: "Not A Valid Key!" },
      BEARER,
    );
    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("reports the recipient count on a dry run and sends nothing", async () => {
    const res = await post({ ...VALID_BODY, dryRun: true }, BEARER);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      dryRun: true,
      recipientCount: 2,
      segment: null,
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(broadcastCreate).not.toHaveBeenCalled();
  });

  it("sends to every subscriber, writes an audit row, and gives each recipient their own unsubscribe link", async () => {
    const res = await post(VALID_BODY, BEARER);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      sentCount: 2,
      recipientCount: 2,
    });

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const calls = sendEmail.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.to)).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(calls[0].subject).toBe(VALID_BODY.subject);

    // Distinct, per-recipient unsubscribe URLs — the whole reason the footer
    // is injected in the send loop rather than once up front.
    expect(calls[0].html).toContain("token=tok-aaa");
    expect(calls[1].html).toContain("token=tok-bbb");
    expect(calls[0].html).not.toContain("token=tok-bbb");
    expect(calls[0].html).toContain("Today in AI");
    expect(calls[0].text).toContain("Unsubscribe:");

    expect(broadcastCreate).toHaveBeenCalledTimes(1);
    expect(broadcastCreate.mock.calls[0][0].data).toMatchObject({
      jobId: VALID_BODY.dedupeKey,
      subject: VALID_BODY.subject,
      segment: null,
      recipientCount: 2,
      sentCount: 2,
      status: "sent",
    });
  });

  it("records a partial status when some sends fail", async () => {
    sendEmail.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const res = await post(VALID_BODY, BEARER);
    expect(res.status).toBe(200);
    expect(broadcastCreate.mock.calls[0][0].data).toMatchObject({
      sentCount: 1,
      status: "partial",
    });
  });

  it("502s and records failure when no send succeeds", async () => {
    sendEmail.mockResolvedValue(false);
    const res = await post(VALID_BODY, BEARER);
    expect(res.status).toBe(502);
    expect(broadcastCreate.mock.calls[0][0].data).toMatchObject({
      sentCount: 0,
      status: "failed",
    });
  });

  it("409s already_broadcast when the same dedupeKey already went out", async () => {
    broadcastFindFirst.mockResolvedValue({
      id: "b0",
      createdAt: new Date("2026-09-09T06:00:00.000Z"),
      sentCount: 7,
    });
    const res = await post(VALID_BODY, BEARER);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "already_broadcast",
      sentCount: 7,
      broadcastAt: "2026-09-09T06:00:00.000Z",
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("400s when the segment has no confirmed subscribers", async () => {
    findMany.mockResolvedValue([]);
    const res = await post({ ...VALID_BODY, segment: "Investors" }, BEARER);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("investors"),
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("scopes the send-once check to the normalized segment", async () => {
    await post({ ...VALID_BODY, segment: "Investors" }, BEARER);
    expect(broadcastFindFirst.mock.calls[0][0].where).toMatchObject({
      jobId: VALID_BODY.dedupeKey,
      segment: "investors",
    });
    expect(broadcastCreate.mock.calls[0][0].data).toMatchObject({
      segment: "investors",
    });
  });
});
