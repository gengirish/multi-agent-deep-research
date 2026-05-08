import { expect, test } from "@playwright/test";

test.describe("App navigation", () => {
  test("clicking 'Try a query' from landing lands on /research", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Try a query/i }).first().click();
    await expect(page).toHaveURL(/\/research(\?.*)?$/);
  });

  test("sidebar workspace nav routes to History and Visualizations", async ({
    page,
  }) => {
    await page.goto("/research");

    // Use href-based selectors to avoid matching shortcut hint text
    await page.locator('.appsb__nav-item[href="/history"]').first().click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(
      page.getByRole("heading", { name: /Research History/i, level: 1 })
    ).toBeVisible();

    await page
      .locator('.appsb__nav-item[href="/visualizations"]')
      .first()
      .click();
    await expect(page).toHaveURL(/\/visualizations$/);
  });

  test("sidebar 'New research' CTA links to /research", async ({ page }) => {
    await page.goto("/about");
    const cta = page.locator(".appsb__cta");
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
    // only verify the URL is reachable and the app shell mounts).
    const response = await page.goto(href!);
    expect(response?.status()).toBeLessThan(400);

    // The app top bar's brand mounts on /research
    await expect(page.locator(".apptop__brandname").first()).toContainText(
      /Chronicle/i
    );
  });

  test("brand logo in app top bar navigates back to /", async ({ page }) => {
    await page.goto("/about");
    await page
      .locator(".apptop__brand")
      .click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("breadcrumbs render on app pages", async ({ page }) => {
    await page.goto("/research");
    const breadcrumbs = page.locator(".breadcrumbs");
    await expect(breadcrumbs).toBeVisible();
    await expect(breadcrumbs).toContainText(/Chronicle/);
    await expect(breadcrumbs).toContainText(/Research/);
  });
});
