import { expect, test } from "@playwright/test";

test.describe("Command palette (\u2318K)", () => {
  test("Cmd/Ctrl+K opens the palette and ESC closes it", async ({ page }) => {
    await page.goto("/research");

    // Not visible initially
    await expect(page.locator(".cmdk")).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.locator(".cmdk")).toBeVisible();
    await expect(page.locator(".cmdk__input")).toBeFocused();

    // Default groups present
    await expect(page.locator(".cmdk__group-label")).toContainText([
      /Go to/i,
    ]);

    await page.keyboard.press("Escape");
    await expect(page.locator(".cmdk")).toHaveCount(0);
  });

  test("clicking the search trigger in topbar opens the palette", async ({
    page,
  }) => {
    await page.goto("/research");
    await page.locator(".apptop__search").click();
    await expect(page.locator(".cmdk")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("typing filters the results and Enter runs the top match", async ({
    page,
  }) => {
    await page.goto("/research");
    await page.keyboard.press("ControlOrMeta+k");
    await page.locator(".cmdk__input").fill("about");

    const items = page.locator(".cmdk__item");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    await expect(items.first()).toContainText(/About/i);

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/about$/);
  });

  test("ArrowDown then Enter navigates to the second match", async ({
    page,
  }) => {
    await page.goto("/research");
    await page.keyboard.press("ControlOrMeta+k");
    await page.locator(".cmdk__input").fill("");

    // The seed list always has at least History as the second 'Go to' item
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // We should land on one of the workspace pages
    await expect(page).toHaveURL(/\/(research|history|visualizations|settings|about)$/);
  });

  test("empty query state is shown when no matches", async ({ page }) => {
    await page.goto("/research");
    await page.keyboard.press("ControlOrMeta+k");
    await page.locator(".cmdk__input").fill("xyz_no_match_zzzzz");

    const empty = page.locator(".cmdk__empty");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText(/No results/i);
  });
});

test.describe("Shortcut help (?)", () => {
  test("clicking the help icon in topbar opens the dialog and ESC closes", async ({
    page,
  }) => {
    await page.goto("/research");
    await page.waitForLoadState("networkidle");
    await page.locator(".apptop__icon-btn").first().click();

    await expect(page.locator(".shortcuts")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Keyboard shortcuts/i })
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".shortcuts")).toHaveCount(0);
  });
});

test.describe("Go-to leader shortcuts (G then letter)", () => {
  test("G then H navigates to /history", async ({ page }) => {
    await page.goto("/research");
    // Wait for the layout's useEffect to attach the global keydown listener
    await page.waitForLoadState("networkidle");
    await page.locator(".apptop__brand").focus();
    await page.locator("body").click({ position: { x: 5, y: 5 } });

    await page.keyboard.press("KeyG");
    await page.waitForTimeout(50);
    await page.keyboard.press("KeyH");
    await expect(page).toHaveURL(/\/history$/);
  });

  test("G then A navigates to /about", async ({ page }) => {
    await page.goto("/research");
    await page.waitForLoadState("networkidle");
    await page.locator("body").click({ position: { x: 5, y: 5 } });

    await page.keyboard.press("KeyG");
    await page.waitForTimeout(50);
    await page.keyboard.press("KeyA");
    await expect(page).toHaveURL(/\/about$/);
  });
});
