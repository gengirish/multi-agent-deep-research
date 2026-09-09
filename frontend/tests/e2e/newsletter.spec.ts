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

test.describe("Dedicated /newsletter page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/newsletter");
  });

  test("is public and renders the sign-up form", async ({ page }) => {
    // No redirect to sign-in — the page has to be reachable anonymously,
    // since it is the destination for every shared subscribe link.
    await expect(page).toHaveURL(/\/newsletter$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /put in front of a partner/i }),
    ).toBeVisible();
    await expect(page.locator(".subscribe__form")).toBeVisible();
  });

  test("collects an optional name alongside the email", async ({ page }) => {
    await expect(page.getByLabel("Your name")).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Subscribe$/i }),
    ).toBeDisabled();
  });

  test("tells the subscriber to confirm by email", async ({ page }) => {
    let posted: Record<string, unknown> | null = null;
    await page.route("**/api/subscribe", async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          pending: true,
          message:
            "Almost there — check your inbox and click the confirmation link.",
        }),
      });
    });

    await page.getByLabel("Your name").fill("Ada Lovelace");
    await page.getByLabel("Email address").fill("e2e-optin@example.com");
    await page.getByRole("button", { name: /^Subscribe$/i }).click();

    await expect(page.locator(".subscribe__success")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator(".subscribe__success")).toContainText(
      /check your inbox/i,
    );

    // The capture surface is recorded so sign-ups can be attributed.
    expect(posted).toMatchObject({
      email: "e2e-optin@example.com",
      name: "Ada Lovelace",
      source: "newsletter",
    });
  });

  test("landing page links here for the full pitch", async ({ page }) => {
    await page.goto("/");
    await page.locator(".newsletter").scrollIntoViewIfNeeded();
    const link = page.locator(".newsletter__more");
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/newsletter$/);
  });
});
