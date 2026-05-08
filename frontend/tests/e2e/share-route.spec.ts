import { expect, test } from "@playwright/test";

/**
 * /r/[id] is the public, shareable report route. We verify rendering + the
 * error state. We don't have a guaranteed-valid id in CI, so we test:
 *  1. The route shells out correctly even with a bogus id (renders with the
 *     CTA and footer, error state appears for the report area).
 *  2. The page-level metadata is set per id.
 */

test.describe("Shareable report route /r/[id]", () => {
  test("renders shell + 'Run your own research' CTA for any id", async ({
    page,
  }) => {
    await page.goto("/r/test-id-12345");

    // Brand chrome stays consistent
    await expect(page.locator(".topnav__brandname")).toHaveText("Chronicle");

    // Hero card with the report id slice and CTA
    await expect(page.locator(".share__header")).toBeVisible();
    await expect(page.locator(".share__cta-btn")).toHaveAttribute(
      "href",
      "/research"
    );

    // Footer card with the upsell
    await expect(page.locator(".share__footer-card")).toContainText(
      /Want one of these for your market/i
    );
  });

  test("shows error state for an unknown report id", async ({ page }) => {
    await page.goto("/r/definitely-not-a-real-id-9999");

    // Error block should appear (backend will 404 the unknown id)
    const errorBox = page.locator(".share__error");
    await expect(errorBox).toBeVisible({ timeout: 15_000 });
    await expect(errorBox).toContainText(/Couldn.{1,3}t load/i);
  });

  test("per-report <title> includes the id slice", async ({ page }) => {
    await page.goto("/r/abcdef1234567890");
    const title = await page.title();
    // generateMetadata uses the first 8 chars of the id
    expect(title).toContain("abcdef12");
  });
});
