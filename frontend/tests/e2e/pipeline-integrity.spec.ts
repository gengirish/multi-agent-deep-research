import { expect, test } from "@playwright/test";

/**
 * Pipeline integrity — the gap that let a broken deployment ship.
 *
 * Every other spec in this suite mocks the research API, so all 89 of them
 * passed green for months while the deployed backend returned canned mock
 * analysis: the same three "key findings" and the same single contradiction
 * for every query, with credibility scores pinned to an internal failure
 * constant. The UI rendered it perfectly, so the UI tests were happy.
 *
 * This test hits the real backend and asserts the *content* is real. It is
 * slow (a genuine run retrieves ~17 sources and takes 45-90s) and costs a few
 * cents of model spend. That is the price of knowing the product works rather
 * than knowing the markup does.
 *
 * One pipeline run, soft assertions throughout, so a single call still
 * reports every failing check instead of stopping at the first.
 *
 * Set CHRONICLE_SKIP_LIVE=1 to skip (e.g. against a backend with no keys).
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "https://multi-agent-deep-research-api.fly.dev";

// Canned strings the agents used to emit on failure. If any reappears in a
// response, a stage has silently fallen back again.
const MOCK_MARKERS = [
  "Mock analysis - LLM not configured",
  "Mock insights - LLM not configured",
  "Some sources present conflicting viewpoints on key aspects",
  "Topic shows significant recent development",
  "The research reveals significant developments in the field",
  "Hypothesis 1: The trend will continue based on current evidence",
];

const QUERY =
  "What are the latest techniques for reducing hallucination in retrieval-augmented generation?";

test.describe("Pipeline integrity (live backend)", () => {
  test.skip(
    !!process.env.CHRONICLE_SKIP_LIVE,
    "CHRONICLE_SKIP_LIVE set — skipping live pipeline assertions",
  );

  test("a real research run returns real analysis", async ({ request }) => {
    // A cold Fly machine plus a full multi-agent run has been observed at 92s;
    // the budget is generous because a slow pass beats a flaky failure.
    test.setTimeout(360_000);

    const response = await request.post(`${API_URL}/api/research`, {
      data: { query: QUERY },
      timeout: 300_000,
    });
    expect(response.status()).toBe(200);
    const body = await response.json();

    // --- no stage fell back -------------------------------------------------
    expect.soft(body.status).toBe("success");
    expect
      .soft(body.degraded ?? [], "degraded stages reported by the backend")
      .toEqual([]);

    // --- nothing canned anywhere in the payload -----------------------------
    const serialized = JSON.stringify(body);
    for (const marker of MOCK_MARKERS) {
      expect
        .soft(serialized, `canned fallback string present: "${marker}"`)
        .not.toContain(marker);
    }
    expect.soft(serialized).not.toContain("[unavailable]");

    // --- analysis is derived from the sources -------------------------------
    const rawAnalysis: string = body.analysis?.raw_analysis ?? "";
    expect.soft(rawAnalysis.length, "raw_analysis length").toBeGreaterThan(200);
    const contradictions: string[] = body.analysis?.contradictions ?? [];
    expect.soft(contradictions.length, "contradictions found").toBeGreaterThan(0);
    expect
      .soft(contradictions.join(" ").length, "contradiction detail")
      .toBeGreaterThan(80);

    // --- insights exist -----------------------------------------------------
    expect
      .soft((body.insights?.hypotheses ?? []).length, "hypotheses generated")
      .toBeGreaterThan(0);

    // --- all three retrieval channels produced sources ----------------------
    const sources = body.sources ?? {};
    expect.soft(sources.errors ?? null, "retrieval channel errors").toBeNull();
    expect.soft((sources.web ?? []).length, "web sources").toBeGreaterThan(0);
    expect.soft((sources.news ?? []).length, "news sources").toBeGreaterThan(0);
    // The paper channel silently returned zero for months because LangChain's
    // arXiv wrapper broke against arxiv>=2.2. Assert it explicitly.
    expect.soft((sources.papers ?? []).length, "arXiv papers").toBeGreaterThan(0);

    // --- credibility came from the model, not the failure constant ----------
    const credibility = body.credibility ?? {};
    const scored: any[] = ["web", "papers", "news"].flatMap(
      (bucket) => credibility[bucket] ?? [],
    );
    expect.soft(scored.length, "sources scored").toBeGreaterThan(0);
    expect
      .soft(
        scored.filter((s) => s.llm_scored).length,
        "sources scored by the model",
      )
      .toBeGreaterThan(0);
    const llmScores = scored
      .map((s) => s.llm_score)
      .filter((v: unknown): v is number => typeof v === "number");
    // Every source landing on exactly 0.5 is the signature of the failure path.
    expect
      .soft(new Set(llmScores).size, "distinct model credibility scores")
      .toBeGreaterThan(1);

    // --- the report cites sources that were actually retrieved --------------
    const report: string = body.report ?? "";
    expect.soft(report.length, "report length").toBeGreaterThan(500);

    const retrieved = new Set(
      ["web", "papers", "news"]
        .flatMap((bucket) => sources[bucket] ?? [])
        .map((s: any) => normalize(s.url))
        .filter(Boolean),
    );
    const cited = [
      ...new Set(
        [...report.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g)].map((m) =>
          normalize(m[1]),
        ),
      ),
    ].filter(Boolean);

    expect.soft(cited.length, "citations in report").toBeGreaterThan(0);
    if (cited.length) {
      const grounded = cited.filter((url) => retrieved.has(url));
      // Measured at 96.9% across 6 queries on 26 Jul 2026. The floor sits
      // below that to tolerate the report model occasionally reaching for a
      // URL of its own, while still failing loudly if grounding collapses.
      expect
        .soft(grounded.length / cited.length, "citation grounding rate")
        .toBeGreaterThanOrEqual(0.8);
    }
  });
});

/** Strip scheme, www and trailing slash so cited and retrieved URLs compare. */
function normalize(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url.trim().replace(/[.,);\]'"]+$/, ""));
    return `${parsed.host.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}
