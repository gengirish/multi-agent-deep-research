import type { Page, Route } from "@playwright/test";

/** Minimal research payload returned by mocked job APIs. */
export const MOCK_RESEARCH_DATA = {
  sources: {
    web: [
      { title: "E2E Source 1", url: "https://example.com/1" },
      { title: "E2E Source 2", url: "https://example.com/2" },
    ],
    papers: [{ title: "E2E Paper", url: "https://arxiv.org/abs/e2e" }],
    news: [],
  },
  analysis: {
    contradictions: ["Conflicting TAM estimates between sources"],
    signals: ["Growing enterprise adoption"],
  },
  insights: {
    insights: ["Market consolidating around incumbents"],
  },
  credibility: {
    scores: [
      { source: "E2E Source 1", score: 0.82, quality: 0.78, type: "web" },
      { source: "E2E Paper", score: 0.91, quality: 0.88, type: "papers" },
    ],
    average_score: 0.87,
  },
  report:
    "# E2E Market Report\n\n## TAM\n\n$12B global market with 18% CAGR.\n\n## Sources\n\n- [E2E Source 1](https://example.com/1)",
  status: "success",
  conversation: {
    query_id: "e2e-job",
    conversation: [
      {
        timestamp: new Date(Date.now() - 3000).toISOString(),
        agent: "retriever",
        action: "retrieve",
        type: "action",
      },
      {
        timestamp: new Date(Date.now() - 1000).toISOString(),
        agent: "reporter",
        action: "report",
        type: "action",
      },
    ],
    total_entries: 2,
  },
};

export const MOCK_JOB_ID = "e2e-test-job-0001";

/**
 * Intercept Chronicle research job APIs so E2E can exercise the full UI
 * without waiting 30–90s for a real multi-agent run.
 */
export async function installResearchMocks(
  page: Page,
  options: { failJobCreate?: boolean; degraded?: string[] } = {},
): Promise<void> {
  // `degraded` lets a test exercise the partial-run banner without needing a
  // genuinely broken backend.
  const researchData = options.degraded
    ? { ...MOCK_RESEARCH_DATA, degraded: options.degraded }
    : MOCK_RESEARCH_DATA;

  const sseBody = [
    `data: ${JSON.stringify({ stage: "retrieval", message: "Searching sources…", progress: 20 })}\n\n`,
    `data: ${JSON.stringify({ stage: "enrichment", message: "Enriching metadata…", progress: 45 })}\n\n`,
    `data: ${JSON.stringify({ stage: "complete", data: researchData })}\n\n`,
  ].join("");

  await page.route("**/api/research/jobs", async (route: Route) => {
    if (route.request().method() === "POST") {
      if (options.failJobCreate) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Service unavailable" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ job_id: MOCK_JOB_ID }),
      });
      return;
    }
    await route.continue();
  });

  await page.route(`**/api/research/jobs/${MOCK_JOB_ID}/stream`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
      body: sseBody,
    });
  });

  await page.route(`**/api/research/jobs/${MOCK_JOB_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: researchData, status: "success" }),
    });
  });
}

/** Mock the conversations list used by History and Visualizations pages. */
export async function installConversationsMock(page: Page): Promise<void> {
  const conversations = [
    {
      id: "conv-e2e-001",
      timestamp: new Date().toISOString(),
      query: "E2E test market sizing query",
      file_name: "e2e-report.md",
      file_size: 4096,
    },
  ];

  await page.route("**/api/conversations?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(conversations),
    });
  });

  await page.route("**/api/conversations/conv-e2e-001", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...conversations[0],
        data: MOCK_RESEARCH_DATA,
      }),
    });
  });
}

/**
 * Returns true when middleware auth gating is active (JWT_SECRET configured).
 * Production may run without gating until auth is fully deployed.
 */
export async function isAuthGatingEnabled(page: Page): Promise<boolean> {
  await page.goto("/audience");
  await page.waitForLoadState("domcontentloaded");
  return page.url().includes("/sign-in");
}
