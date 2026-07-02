import { expect, test } from "@playwright/test";
import { installConversationsMock, isAuthGatingEnabled } from "./helpers";

test.describe("About page", () => {
  test("covers product story, agents, MCP, and team", async ({ page }) => {
    await page.goto("/about");

    await expect(
      page.getByRole("heading", { name: /About Chronicle/i, level: 1 }),
    ).toBeVisible();
    await expect(page.locator("body")).toContainText(/Why we built it/i);
    await expect(page.locator("body")).toContainText(/Verified results/i);
    await expect(page.locator("body")).toContainText(/10×|10x/);
    await expect(page.locator("body")).toContainText(/Retriever/i);
    await expect(page.locator("body")).toContainText(/Report builder/i);

    await expect(page.locator("body")).toContainText(/MCP integration/i);
    await expect(page.locator("body")).toContainText(/chronicle-mcp/i);
    await expect(page.locator("body")).toContainText(/research_market/i);
    await expect(
      page.getByRole("link", { name: /mcp\/README\.md/i }),
    ).toHaveAttribute("href", /github\.com\/gengirish\/multi-agent-deep-research/);

    await expect(page.getByRole("link", { name: /Try a query/i })).toHaveAttribute(
      "href",
      "/research",
    );
  });
});

test.describe("Settings page", () => {
  test("shows backend URL and privacy copy", async ({ page }) => {
    await page.goto("/settings");

    await expect(
      page.getByRole("heading", { name: /Settings/i, level: 1 }),
    ).toBeVisible();
    await expect(page.locator("body")).toContainText(/Backend/i);
    await expect(page.locator("body")).toContainText(/Privacy/i);
    await expect(page.locator("body")).toContainText(
      /does not require an account/i,
    );
    await expect(page.locator("body")).toContainText(/Open source/i);

    // Backend URL is rendered in a monospace block (Fly.io prod or localhost dev).
    await expect(page.locator("body")).toContainText(
      /multi-agent-deep-research-api|localhost:8000/,
    );
  });
});

test.describe("History page", () => {
  test("renders search controls and session list or empty state", async ({
    page,
  }) => {
    const gated = await isAuthGatingEnabled(page);
    test.skip(gated, "History UI requires authenticated session when gating is on");

    await installConversationsMock(page);
    await page.goto("/history");

    await expect(
      page.getByRole("heading", { name: /Research History/i, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: /Search conversations/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Refresh history/i }),
    ).toBeVisible();

    await expect(
      page.locator(".history-table, .empty-state, .error-state").first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Landing extended sections", () => {
  test("trust pillars and founder audience sections render", async ({ page }) => {
    await page.goto("/");

    const trust = page.locator(".pillars");
    await trust.scrollIntoViewIfNeeded();
    await expect(trust).toBeVisible();
    await expect(trust).toContainText(/Every source scored/i);
    await expect(trust).toContainText(/Contradictions surfaced/i);
    await expect(trust).toContainText(/Every figure cited/i);

    const who = page.locator(".who");
    await who.scrollIntoViewIfNeeded();
    await expect(who).toContainText(/Pre-fundraise/i);
    await expect(who).toContainText(/YC application/i);
    await expect(who).toContainText(/MCP/i);
  });

  test("top nav links to About and GitHub", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".topnav__brandname")).toHaveText("Chronicle");
    await expect(page.getByRole("link", { name: /^About$/i }).first()).toHaveAttribute(
      "href",
      "/about",
    );

    const github = page.locator(".topnav").getByRole("link", { name: /GitHub/i });
    await expect(github).toHaveAttribute(
      "href",
      /github\.com\/gengirish\/multi-agent-deep-research/,
    );
  });
});

test.describe("Backend connectivity", () => {
  test("Chronicle API health endpoint responds", async ({ request }) => {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ??
      "https://multi-agent-deep-research-api.fly.dev";
    const response = await request.get(`${apiUrl}/api/health`);
    expect(response.status()).toBeLessThan(500);

    const body = await response.json();
    expect(body.status ?? body.ok ?? body.healthy).toBeTruthy();
  });

  test("demo queries endpoint returns starter queries", async ({ request }) => {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ??
      "https://multi-agent-deep-research-api.fly.dev";
    const response = await request.get(`${apiUrl}/api/demo-queries`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.queries)).toBeTruthy();
    expect(body.queries.length).toBeGreaterThan(0);
  });
});
