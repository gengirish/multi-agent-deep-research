import { expect, test } from "@playwright/test";

test.describe("Visualizations page", () => {
  test("renders header, dataset selector, and sample KPIs", async ({ page }) => {
    await page.goto("/visualizations");

    await expect(
      page.getByRole("heading", { name: /Data Visualizations/i, level: 1 }),
    ).toBeVisible();
    await expect(page.locator("#dataset-select")).toBeVisible();
    await expect(page.locator("#dataset-select")).toContainText(
      /Current results \(sample data\)/i,
    );

    const kpis = page.locator(".viz-kpis");
    await expect(kpis).toBeVisible({ timeout: 15_000 });
    await expect(kpis.locator(".kpi-card")).toHaveCount(4);
    await expect(kpis).toContainText(/Sources/i);
    await expect(kpis).toContainText(/Avg credibility/i);
    await expect(kpis).toContainText(/Agents/i);
  });

  test("renders credibility and source distribution chart sections", async ({
    page,
  }) => {
    await page.goto("/visualizations");

    await expect(
      page.getByRole("heading", { name: /Source credibility/i, level: 2 }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: /Source distribution/i, level: 2 }),
    ).toBeVisible();
    await expect(page.locator(".viz-grid .viz-card").first()).toBeVisible();
  });

  test("renders agent activity charts from sample conversation data", async ({
    page,
  }) => {
    await page.goto("/visualizations");

    await expect(
      page.getByRole("heading", { name: /Agent activity/i, level: 2 }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".viz-section").last()).toBeVisible();
  });
});
