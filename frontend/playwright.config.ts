import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Chronicle.
 *
 * Modes:
 *   - default                            → runs against the live deployment
 *   - BASE_URL=http://localhost:3000 ... → runs against any URL you set
 *   - npm run test:e2e:local             → spawns `next dev` + tests it
 *
 * The webServer block only runs when the test target is localhost — we never
 * spin up a dev server when pointing at production.
 */

const BASE_URL =
  process.env.BASE_URL ?? "https://deep-research.intelliforge.tech";
const isLocal = BASE_URL.includes("localhost") || BASE_URL.includes("127.0.0.1");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: isLocal
    ? {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_API_URL:
            process.env.NEXT_PUBLIC_API_URL ??
            "https://multi-agent-deep-research-api.fly.dev",
        },
      }
    : undefined,
});
