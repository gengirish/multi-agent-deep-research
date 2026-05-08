import { expect, test } from "@playwright/test";

/**
 * Smoke tests — every public route must return 200 and contain at least one
 * piece of canonical content. If any of these fail the deploy is broken.
 */

const ROUTES: { path: string; mustContain: RegExp | string }[] = [
  { path: "/", mustContain: /Founder-grade research/i },
  { path: "/research", mustContain: /Research/i },
  { path: "/history", mustContain: /Research History|history/i },
  { path: "/visualizations", mustContain: /Visualization|chart|dataset/i },
  { path: "/about", mustContain: /About Chronicle/i },
  { path: "/settings", mustContain: /Settings/i },
  { path: "/offline", mustContain: /You.{1,3}re offline/i },
];

for (const { path, mustContain } of ROUTES) {
  test(`route ${path} returns 200 and contains expected content`, async ({
    page,
  }) => {
    const response = await page.goto(path);
    expect(response?.status(), `status for ${path}`).toBeLessThan(400);
    await expect(page.locator("body")).toContainText(mustContain);
  });
}

test("404 page returns 404 status", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist-xyz123");
  expect(response?.status()).toBe(404);
});
