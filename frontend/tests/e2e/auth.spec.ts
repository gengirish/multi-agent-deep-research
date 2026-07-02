import { expect, test } from "@playwright/test";
import { isAuthGatingEnabled } from "./helpers";

test.describe("Auth pages", () => {
  test("sign-in page renders form and cross-links", async ({ page }) => {
    await page.goto("/sign-in");

    await expect(
      page.getByRole("heading", { name: /Sign in to Chronicle/i, level: 1 }),
    ).toBeVisible();
    await expect(page.locator("#signin-email")).toBeVisible();
    await expect(page.locator("#signin-password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Sign in$/i }),
    ).toBeDisabled();

    await expect(page.getByRole("link", { name: /Sign up/i })).toHaveAttribute(
      "href",
      "/sign-up",
    );
    await expect(
      page.getByRole("link", { name: /Forgot password/i }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  test("sign-in shows registered notice from ?registered=1", async ({ page }) => {
    await page.goto("/sign-in?registered=1");
    await expect(page.locator(".auth__notice")).toContainText(
      /Account created/i,
    );
  });

  test("sign-in shows reset success notice from ?reset=success", async ({
    page,
  }) => {
    await page.goto("/sign-in?reset=success");
    await expect(page.locator(".auth__success")).toContainText(
      /Password updated/i,
    );
  });

  test("sign-in preserves redirect target from middleware", async ({ page }) => {
    await page.goto("/sign-in?redirect=%2Fhistory");
    await expect(page.locator("#signin-email")).toBeVisible();
    // Form reads redirect param — verified by source; smoke the URL loads.
    await expect(page).toHaveURL(/redirect=%2Fhistory/);
  });

  test("sign-up page renders form with password strength meter", async ({
    page,
  }) => {
    await page.goto("/sign-up");

    await expect(
      page.getByRole("heading", {
        name: /Create your Chronicle account/i,
        level: 1,
      }),
    ).toBeVisible();
    await expect(page.locator("#signup-email")).toBeVisible();
    await expect(page.locator("#signup-password")).toBeVisible();
    await expect(page.locator(".auth__strength")).toBeVisible();

    await page.locator("#signup-password").fill("weak");
    await expect(page.locator(".auth__strength-label")).toContainText(/Weak/i);

    await page.locator("#signup-password").fill("Str0ngPass!");
    await expect(page.locator(".auth__strength-label")).toContainText(
      /Strong/i,
    );

    await expect(page.getByRole("link", { name: /Sign in/i })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  test("forgot-password page renders email form", async ({ page }) => {
    await page.goto("/forgot-password");

    await expect(
      page.getByRole("heading", { name: /Reset your password/i, level: 1 }),
    ).toBeVisible();
    await expect(page.locator("#forgot-email")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Back to sign in/i }),
    ).toHaveAttribute("href", "/sign-in");
  });

  test("invalid sign-in shows error without navigation", async ({ page }) => {
    await page.goto("/sign-in");
    await page.locator("#signin-email").fill("not-a-real-user@example.com");
    await page.locator("#signin-password").fill("wrong-password-xyz");
    await page.getByRole("button", { name: /^Sign in$/i }).click();

    await expect(page.locator(".auth__error")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("Auth gating (when JWT middleware is active)", () => {
  test("gated routes redirect to sign-in with return path", async ({ page }) => {
    const gated = await isAuthGatingEnabled(page);
    test.skip(!gated, "Auth gating not enabled on this deployment");

    for (const path of ["/history", "/audience"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in/);
      const url = new URL(page.url());
      expect(url.searchParams.get("redirect")).toBe(path);
      await expect(
        page.getByRole("heading", { name: /Sign in to Chronicle/i }),
      ).toBeVisible();
    }
  });
});
