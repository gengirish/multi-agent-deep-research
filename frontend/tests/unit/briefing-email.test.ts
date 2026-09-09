import { describe, it, expect } from "vitest";
import {
  injectUnsubscribeFooter,
  buildUnsubscribeFooterHtml,
} from "@/lib/briefing-email";

const URL_A = "https://example.com/api/unsubscribe?token=abc123";

describe("injectUnsubscribeFooter", () => {
  it("inserts the footer before </body> in a full document", () => {
    const html = "<html><body><h1>Briefing</h1></body></html>";
    const out = injectUnsubscribeFooter({ html, unsubscribeUrl: URL_A });

    expect(out.html).toContain(URL_A.replace(/&/g, "&amp;"));
    // Footer lands inside the body, not after the document.
    expect(out.html.indexOf("Unsubscribe")).toBeLessThan(
      out.html.indexOf("</body>"),
    );
    expect(out.html.startsWith("<html><body><h1>Briefing</h1>")).toBe(true);
    expect(out.html.endsWith("</body></html>")).toBe(true);
  });

  it("appends the footer when the body is a fragment", () => {
    const html = "<h1>Briefing</h1><p>Today in AI.</p>";
    const out = injectUnsubscribeFooter({ html, unsubscribeUrl: URL_A });

    expect(out.html.startsWith(html)).toBe(true);
    expect(out.html).toContain("Unsubscribe");
  });

  it("uses the last </body> so an escaped sample doesn't divert it", () => {
    const html =
      "<html><body>see &lt;/body&gt; and </body> literal</body></html>";
    const out = injectUnsubscribeFooter({ html, unsubscribeUrl: URL_A });
    const footer = buildUnsubscribeFooterHtml(URL_A);

    expect(out.html.indexOf(footer)).toBeGreaterThan(
      out.html.indexOf("literal"),
    );
  });

  it("escapes the URL so it cannot break out of the href", () => {
    const hostile = 'https://example.com/u?t="><script>alert(1)</script>';
    const out = injectUnsubscribeFooter({
      html: "<p>hi</p>",
      unsubscribeUrl: hostile,
    });

    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("appends an unsubscribe line to the plaintext part when present", () => {
    const out = injectUnsubscribeFooter({
      html: "<p>hi</p>",
      text: "Today in AI.",
      unsubscribeUrl: URL_A,
    });

    expect(out.text).toContain("Today in AI.");
    expect(out.text).toContain(`Unsubscribe: ${URL_A}`);
  });

  it("leaves text undefined when the caller supplied none", () => {
    const out = injectUnsubscribeFooter({
      html: "<p>hi</p>",
      unsubscribeUrl: URL_A,
    });
    expect(out.text).toBeUndefined();
  });

  it("produces a distinct footer per recipient", () => {
    const a = injectUnsubscribeFooter({
      html: "<p>hi</p>",
      unsubscribeUrl: "https://example.com/api/unsubscribe?token=aaa",
    });
    const b = injectUnsubscribeFooter({
      html: "<p>hi</p>",
      unsubscribeUrl: "https://example.com/api/unsubscribe?token=bbb",
    });
    expect(a.html).not.toEqual(b.html);
  });
});
