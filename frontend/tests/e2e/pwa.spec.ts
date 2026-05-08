import { expect, test } from "@playwright/test";

test.describe("PWA assets", () => {
  test("manifest.webmanifest is valid JSON with required fields", async ({
    request,
  }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);

    const manifest = await response.json();
    expect(manifest.name).toMatch(/Chronicle/i);
    expect(manifest.short_name).toBe("Chronicle");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();

    // Must declare both 192 and 512 icons + a maskable icon
    expect(Array.isArray(manifest.icons)).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    const maskable = manifest.icons.find(
      (i: { purpose?: string }) => i.purpose === "maskable"
    );
    expect(maskable).toBeTruthy();
  });

  test("sw.js has correct headers and exports CACHE_NAME", async ({
    request,
  }) => {
    const response = await request.get("/sw.js");
    expect(response.status()).toBe(200);

    const cacheControl = response.headers()["cache-control"] ?? "";
    expect(cacheControl.toLowerCase()).toContain("no-cache");

    const swAllowed = response.headers()["service-worker-allowed"];
    expect(swAllowed).toBe("/");

    const body = await response.text();
    expect(body).toMatch(/CACHE_NAME\s*=\s*["']chronicle-/);
    expect(body).toMatch(/addEventListener\(\s*["']install["']/);
    expect(body).toMatch(/addEventListener\(\s*["']activate["']/);
    expect(body).toMatch(/addEventListener\(\s*["']fetch["']/);
  });

  const PWA_ASSETS = [
    "/icons/icon-192.svg",
    "/icons/icon-512.svg",
    "/icons/icon-maskable-512.svg",
    "/favicon.svg",
    "/og-image.svg",
  ];

  for (const assetPath of PWA_ASSETS) {
    test(`PWA asset ${assetPath} loads`, async ({ request }) => {
      const response = await request.get(assetPath);
      expect(response.status()).toBe(200);
      const ct = response.headers()["content-type"] ?? "";
      expect(ct).toContain("svg");
    });
  }

  test("offline page renders branded 'You're offline' message", async ({
    page,
  }) => {
    await page.goto("/offline");
    await expect(
      page.getByRole("heading", { name: /You.{1,3}re offline/i, level: 1 })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Try again/i })).toBeVisible();
  });
});
