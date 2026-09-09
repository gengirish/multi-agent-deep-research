import { confirmSubscriberByToken } from "@/lib/subscribers";
import { escapeHtml } from "@/lib/html-escape";
import { noticeResponse, NOTICE_APP_URL } from "@/lib/notice-page";
import { serverError } from "@/lib/api-utils";

export const runtime = "nodejs";

/**
 * Second half of double opt-in: the recipient clicks the link we mailed them
 * and their PENDING row becomes ACTIVE.
 *
 * GET (not POST) because it is reached by a plain click from a mail client.
 * That means link-scanning proxies in corporate mail gateways can and do fetch
 * it, which would confirm a subscription the human never clicked. We accept
 * that: the alternative (an interstitial "click here to really confirm" page)
 * costs real conversions, and the failure mode here is a subscriber who can
 * unsubscribe from any issue in one click. Revisit if bot-confirmations ever
 * show up as a deliverability problem.
 */
export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    const result = await confirmSubscriberByToken(token);

    switch (result.status) {
      case "confirmed":
        return noticeResponse({
          title: "Subscription confirmed",
          heading: "You're on the list",
          bodyHtml: `
            <p style="margin:0 0 12px;"><strong style="color:#0f172a;">${escapeHtml(result.email)}</strong> is confirmed.</p>
            <p style="margin:0;color:#64748b;">The next Chronicle briefing lands in your inbox — cited, defensible, and one click from unsubscribing.</p>
          `,
          ctaHref: `${NOTICE_APP_URL}/research`,
          ctaLabel: "Run your first research query",
        });

      case "already":
        return noticeResponse({
          title: "Already confirmed",
          heading: "You're already on the list",
          bodyHtml: `
            <p style="margin:0 0 12px;"><strong style="color:#0f172a;">${escapeHtml(result.email)}</strong> was confirmed earlier — nothing more to do.</p>
            <p style="margin:0;color:#64748b;">You'll get the next briefing as usual.</p>
          `,
          ctaHref: `${NOTICE_APP_URL}/research`,
          ctaLabel: "Run your first research query",
        });

      case "expired":
        return noticeResponse({
          title: "Link expired",
          heading: "This link has expired",
          bodyHtml: `
            <p style="margin:0 0 12px;">Confirmation links are good for 48 hours, and this one is past that.</p>
            <p style="margin:0;color:#64748b;">Enter your email again and we'll send a fresh one.</p>
          `,
          ctaHref: `${NOTICE_APP_URL}/newsletter`,
          ctaLabel: "Get a new confirmation link",
        });

      default:
        // Bogus token, or one already consumed — indistinguishable by design,
        // since confirming clears the column.
        return noticeResponse({
          title: "Link not valid",
          heading: "This link is no longer valid",
          bodyHtml: `
            <p style="margin:0 0 12px;">It may have already been used, or the address may have been removed from the list.</p>
            <p style="margin:0;color:#64748b;">Subscribing again takes a few seconds.</p>
          `,
          ctaHref: `${NOTICE_APP_URL}/newsletter`,
          ctaLabel: "Subscribe again",
        });
    }
  } catch (err) {
    return serverError(err, "GET /api/subscribe/confirm");
  }
}
