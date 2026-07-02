import { expect, test } from "@playwright/test";
import { installResearchMocks } from "./helpers";

test.describe("Research page", () => {
  test.beforeEach(async ({ page }) => {
    await installResearchMocks(page);
  });

  test("research form renders with accessible search landmark", async ({
    page,
  }) => {
    await page.goto("/research");

    const form = page.locator("form.research-form");
    await expect(form).toBeVisible();
    await expect(form).toHaveAttribute("role", "search");
    await expect(page.locator("#query-input")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Start research/i }),
    ).toBeDisabled();
  });

  test("submit button enables when query is entered", async ({ page }) => {
    await page.goto("/research");
    await page.locator("#query-input").fill("TAM for AI coding assistants 2025");
    await expect(
      page.getByRole("button", { name: /Start research/i }),
    ).toBeEnabled();
  });

  test("text/voice input mode toggle switches UI", async ({ page }) => {
    await page.goto("/research");

    await page.getByRole("button", { name: /Switch to voice input/i }).click();
    await expect(page.locator(".voice-input-container")).toBeVisible();
    await expect(page.locator("#query-input")).toHaveCount(0);

    await page.getByRole("button", { name: /Switch to text input/i }).click();
    await expect(page.locator("#query-input")).toBeVisible();
  });

  test("mocked research run shows progress then results", async ({ page }) => {
    await page.goto("/research");

    await page
      .locator("#query-input")
      .fill("E2E mocked market sizing query");
    await page.getByRole("button", { name: /Start research/i }).click();

    // Progress may flash briefly when mocks resolve instantly — results are the
    // durable signal that the full pipeline UI mounted.
    await expect(page.locator(".results-container")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(".results-container")).toContainText(
      "E2E Market Report",
    );
    await expect(page.locator(".results-container")).toContainText(
      "$12B global market",
    );
    await expect(page.locator(".stats-bar")).toBeVisible();
  });

  test("?q= param triggers mocked run and is stripped from URL", async ({
    page,
  }) => {
    const query = encodeURIComponent("E2E seeded query from URL");
    await page.goto(`/research?q=${query}`);

    await expect(page.locator(".results-container")).toBeVisible({
      timeout: 25_000,
    });

    await expect(page).toHaveURL(/\/research(?:\?.*)?$/, { timeout: 15_000 });
    expect(page.url()).not.toContain("q=");
  });

  test("API failure shows error banner with retry", async ({ page }) => {
    await page.unroute("**/api/research/jobs");
    await installResearchMocks(page, { failJobCreate: true });

    await page.goto("/research");
    await page.locator("#query-input").fill("This should fail");
    await page.getByRole("button", { name: /Start research/i }).click();

    const banner = page.locator(".error-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText(/503|Failed|error/i);
    await expect(
      page.getByRole("button", { name: /Retry operation/i }),
    ).toBeVisible();
  });
});
