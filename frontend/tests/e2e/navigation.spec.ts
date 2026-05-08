import { expect, test } from "@playwright/test";

test.describe("App navigation", () => {
  test("clicking 'Try a query' from landing lands on /research", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Try a query/i }).first().click();
    await expect(page).toHaveURL(/\/research(\?.*)?$/);
  });

  test("topnav links navigate between app pages", async ({ page }) => {
    await page.goto("/research");

    await page.getByRole("link", { name: /^About$/i }).first().click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(
      page.getByRole("heading", { name: /About Chronicle/i })
    ).toBeVisible();

    await page
      .getByRole("link", { name: /^Visualizations$/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/visualizations$/);
  });

  test("topnav 'Try a query' CTA is sticky and reachable from app pages", async ({
    page,
  }) => {
    await page.goto("/about");
    const cta = page
      .locator(".topnav__cta")
      .filter({ hasText: /Try a query/i });
    await expect(cta).toHaveAttribute("href", "/research");
  });

  test("starter query chip from landing seeds the form via ?q=", async ({
    page,
  }) => {
    await page.goto("/");
    const firstChip = page.locator(".chip").first();
    const href = await firstChip.getAttribute("href");
    expect(href).toMatch(/^\/research\?q=/);

    // Navigate via URL directly so we don't trigger an actual research call
    // through the auto-run effect (the effect will kick off a stream — we
    // only verify the URL is reachable and the form mounts).
    const response = await page.goto(href!);
    expect(response?.status()).toBeLessThan(400);

    // The page should at least render (even if a backend call is in flight)
    await expect(page.locator(".topnav__brandname")).toHaveText("Chronicle");
  });

  test("brand logo in topnav navigates back to /", async ({ page }) => {
    await page.goto("/about");
    await page
      .getByRole("link", { name: /Chronicle home/i })
      .click();
    await expect(page).toHaveURL(/\/$/);
  });
});
