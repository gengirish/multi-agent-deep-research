import { expect, test } from "@playwright/test";

test.describe("Landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("hero shows brand, tagline, and live-demo eyebrow", async ({ page }) => {
    await expect(page.locator(".topnav__brandname").first()).toHaveText(
      "Chronicle"
    );
    await expect(page.locator(".hero__title")).toContainText(
      /Founder-grade research/i
    );
    await expect(page.locator(".hero__eyebrow")).toContainText(/Live demo/i);
  });

  test("primary 'Try a query' CTA links to /research", async ({ page }) => {
    const cta = page.locator(".hero__cta .btn--primary");
    await expect(cta).toHaveAttribute("href", /\/research/);
  });

  test("starter query chips deep-link to /research with ?q=", async ({
    page,
  }) => {
    await page.waitForSelector(".chip", { timeout: 15_000 });
    const chips = page.locator(".chip");
    const count = await chips.count();
    expect(count).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < count; i++) {
      const href = await chips.nth(i).getAttribute("href");
      expect(href).toMatch(/^\/research\?q=/);
    }
  });

  test("verified case study band shows 10×, 80%, and a citation", async ({
    page,
  }) => {
    const proof = page.locator(".proof");
    await proof.scrollIntoViewIfNeeded();
    await expect(proof).toBeVisible();
    await expect(proof).toContainText(/10×|10x/);
    await expect(proof).toContainText(/80%/);
    await expect(proof.locator("blockquote.proof__quote").first()).toBeVisible();
  });

  test("Bento grid renders all five agent tiles", async ({ page }) => {
    const tiles = page.locator(".bento__tile");
    await expect(tiles).toHaveCount(5);

    // Eyebrows should be 01..05
    const eyebrows = await page
      .locator(".bento__tile-eyebrow")
      .allInnerTexts();
    expect(eyebrows.some((t) => t.includes("01"))).toBeTruthy();
    expect(eyebrows.some((t) => t.includes("05"))).toBeTruthy();
  });

  test("how-it-works has 3 numbered steps", async ({ page }) => {
    const steps = page.locator(".how__steps .step");
    await expect(steps).toHaveCount(3);
  });

  test("footer mentions IntelliForge AI and links to GitHub repo", async ({
    page,
  }) => {
    const footer = page.locator(".landing__footer");
    await expect(footer).toBeVisible();
    await expect(footer).toContainText(/IntelliForge AI/i);

    const githubLink = footer.getByRole("link", { name: /GitHub/i });
    await expect(githubLink).toHaveAttribute(
      "href",
      /github\.com\/gengirish\/multi-agent-deep-research/
    );
  });
});
