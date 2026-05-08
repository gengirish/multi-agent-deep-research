import { expect, test } from "@playwright/test";

const PAGES = [
  "/",
  "/research",
  "/history",
  "/visualizations",
  "/about",
  "/settings",
];

test.describe("SEO + a11y basics", () => {
  for (const path of PAGES) {
    test(`${path} has lang=en, a non-empty <title>, and exactly one h1`, async ({
      page,
    }) => {
      await page.goto(path);

      const lang = await page.locator("html").getAttribute("lang");
      expect(lang).toBe("en");

      const title = await page.title();
      expect(title.length).toBeGreaterThan(5);

      const h1Count = await page.locator("h1").count();
      expect(h1Count, `expected exactly 1 <h1> on ${path}`).toBe(1);
    });
  }

  test("landing has correct OG metadata", async ({ page }) => {
    await page.goto("/");

    const ogTitle = await page
      .locator('meta[property="og:title"]')
      .getAttribute("content");
    expect(ogTitle).toMatch(/Chronicle/i);

    const ogImage = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(ogImage).toMatch(/og-image\.svg/);

    const ogDesc = await page
      .locator('meta[property="og:description"]')
      .getAttribute("content");
    expect(ogDesc).toBeTruthy();
    expect(ogDesc!.length).toBeGreaterThan(20);
  });

  test("JSON-LD SoftwareApplication structured data is present", async ({
    page,
  }) => {
    await page.goto("/");
    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .innerHTML();
    const data = JSON.parse(jsonLd);
    expect(data["@type"]).toBe("SoftwareApplication");
    expect(data.name).toBe("Chronicle");
  });

  test("skip-link is present and points to main content on app pages", async ({
    page,
  }) => {
    await page.goto("/research");
    const skip = page.locator(".skip-link").first();
    await expect(skip).toHaveAttribute("href", "#main-content");
  });

  test("sidebar workspace nav has correct ARIA labels", async ({ page }) => {
    await page.goto("/research");
    const sidebar = page.locator(".appsb");
    await expect(sidebar).toHaveAttribute("aria-label", /workspace/i);
    await expect(sidebar.locator("nav").first()).toHaveAttribute(
      "aria-label",
      /primary/i
    );
  });

  test("active sidebar item has aria-current=page", async ({ page }) => {
    await page.goto("/about");
    const active = page.locator('.appsb__nav-item[aria-current="page"]');
    await expect(active).toContainText(/About/i);
  });

  test("all GitHub links point to the canonical repo", async ({ page }) => {
    await page.goto("/about");
    const links = page.locator('a[href*="github.com"]');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute("href");
      // Allow LangChain/etc. references; only assert OUR links go to gengirish/multi-agent-deep-research
      if (href?.includes("gengirish")) {
        expect(href).toContain("gengirish/multi-agent-deep-research");
      }
    }
  });
});
