import { expect, test } from "@playwright/test";

test.describe("Newsletter subscribe form", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".newsletter").scrollIntoViewIfNeeded();
  });

  test("renders on landing with email input and subscribe button", async ({
    page,
  }) => {
    const form = page.locator(".newsletter .subscribe__form");
    await expect(form).toBeVisible();
    await expect(page.locator(".subscribe__input")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Subscribe$/i }),
    ).toBeDisabled();
  });

  test("subscribe button enables when email is entered", async ({ page }) => {
    await page.locator(".subscribe__input").fill("founder@example.com");
    await expect(
      page.getByRole("button", { name: /^Subscribe$/i }),
    ).toBeEnabled();
  });

  test("mocked successful subscribe shows confirmation", async ({ page }) => {
    await page.route("**/api/subscribe", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          message: "You're subscribed to the Chronicle briefing.",
        }),
      });
    });

    await page.locator(".subscribe__input").fill("e2e-subscriber@example.com");
    await page.getByRole("button", { name: /^Subscribe$/i }).click();

    await expect(page.locator(".subscribe__success")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator(".subscribe__success")).toContainText(
      /subscribed/i,
    );
  });

  test("mocked API error shows alert message", async ({ page }) => {
    await page.route("**/api/subscribe", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "Enter a valid email." }),
      });
    });

    await page.locator(".subscribe__input").fill("not-an-email");
    await page.getByRole("button", { name: /^Subscribe$/i }).click();

    await expect(page.locator(".subscribe__error")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator(".subscribe__error")).toContainText(/valid email/i);
  });
});
