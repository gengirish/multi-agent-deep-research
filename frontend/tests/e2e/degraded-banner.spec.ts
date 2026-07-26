import { expect, test } from "@playwright/test";
import { installResearchMocks } from "./helpers";

/**
 * The partial-run banner.
 *
 * When a pipeline stage falls back — the analyzer can't reach its model, a
 * retrieval channel fails, credibility scores come from heuristics alone —
 * the API returns a `degraded` list and the reader has to see it. A partial
 * report that looks complete is the failure mode this whole surface exists
 * to prevent, so it is worth asserting in both directions.
 */
test.describe("Degraded-run banner", () => {
  const NOTES = [
    "analyzer: no analysis produced — NotFoundError: model not found. Key findings, claims and contradictions are empty, not inferred.",
    "retrieval: no results from papers — arXiv: HTTPError: 503",
  ];

  test("degraded stages are announced above the report", async ({ page }) => {
    await installResearchMocks(page, { degraded: NOTES });
    await page.goto("/research");

    await page.locator("#query-input").fill("E2E degraded run");
    await page.getByRole("button", { name: /Start research/i }).click();

    const banner = page.locator(".degraded-banner");
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText("Partial run");
    await expect(banner).toContainText("2 stages did not complete");

    // The reason has to survive to the reader — "something went wrong" is not
    // actionable, "arXiv returned 503" is.
    for (const note of NOTES) {
      await expect(banner).toContainText(note);
    }

    // It must sit above the report, not below it, or it is read too late.
    const bannerBox = await banner.boundingBox();
    const reportBox = await page.locator(".results-container").boundingBox();
    expect(bannerBox).not.toBeNull();
    expect(reportBox).not.toBeNull();
    expect(bannerBox!.y).toBeGreaterThanOrEqual(reportBox!.y);
    const firstCard = await page.locator(".result-card").first().boundingBox();
    if (firstCard) {
      expect(bannerBox!.y).toBeLessThan(firstCard.y);
    }
  });

  test("singular wording when exactly one stage degrades", async ({ page }) => {
    await installResearchMocks(page, {
      degraded: ["retrieval: no results from news — Tavily: 401"],
    });
    await page.goto("/research");

    await page.locator("#query-input").fill("E2E single degraded stage");
    await page.getByRole("button", { name: /Start research/i }).click();

    const banner = page.locator(".degraded-banner");
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText("1 stage did not complete");
  });

  test("a healthy run shows no banner at all", async ({ page }) => {
    await installResearchMocks(page);
    await page.goto("/research");

    await page.locator("#query-input").fill("E2E healthy run");
    await page.getByRole("button", { name: /Start research/i }).click();

    await expect(page.locator(".results-container")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(".degraded-banner")).toHaveCount(0);
  });
});
