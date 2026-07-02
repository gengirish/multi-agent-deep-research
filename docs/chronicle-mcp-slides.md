# Chronicle MCP (`chronicle-mcp`) — Presentation Slides

GAA Project · Generative AI Applications

---

## Slide 1 — Title

**Chronicle MCP: Multi-Agent Cited Research from Your IDE**

`chronicle-mcp` on PyPI · MCP server for Cursor & Claude Desktop

**Author:** Girish Hiremath  
**Course:** Generative AI Applications  
**Live demo:** https://deep-research.intelliforge.tech  
**Source:** https://github.com/gengirish/multi-agent-deep-research

---

## Slide 2 — Application & Motivation

**The problem founders face every week**

- Same five questions, repeated: TAM/SAM/SOM, competitive landscape, customer discovery, regulatory intel, funding activity
- ChatGPT → hallucinated citations
- Perplexity → one paragraph, not a report
- Analyst → ~$5k/week

**Our application**

- **Chronicle** — multi-agent research copilot that produces cited, deck-ready markdown reports
- **Chronicle MCP** — PyPI package that exposes that pipeline as tools inside **Cursor** and **Claude Desktop**, so research happens *while you write your deck*

---

## Slide 3 — What We Built (Two Surfaces, One Pipeline)

| Surface | What it is | Who uses it |
|---------|-----------|-------------|
| **Web app** | React frontend + FastAPI backend | Founders browsing the live demo |
| **`chronicle-mcp` (PyPI)** | MCP server wrapping the same pipeline | Developers in Cursor / Claude Desktop |

```bash
pip install chronicle-mcp
```

Five MCP tools → one research pipeline → cited markdown output in ~30–90 seconds.

---

## Slide 4 — What is MCP?

**Model Context Protocol** — open standard for connecting AI hosts to external tools.

```
┌─────────────┐    stdio / HTTP    ┌──────────────────┐    REST API    ┌─────────────┐
│ Cursor or   │ ◄──────────────► │  chronicle-mcp   │ ◄────────────► │  Chronicle  │
│ Claude      │   MCP tools       │  (PyPI package)  │               │  backend    │
└─────────────┘                   └──────────────────┘               └─────────────┘
```

- Host discovers tools (`research_market`, `chronicle_health`, …)
- User prompts naturally: *"Use Chronicle to research TAM for AI coding assistants 2025"*
- No context-switching to a browser tab

---

## Slide 5 — The PyPI Package

**Package:** `chronicle-mcp` v0.1.0  
**License:** MIT · **Python:** ≥3.11  
**Built with:** Hatchling · **Framework:** FastMCP 2.x

```
mcp/
├── pyproject.toml          # PyPI metadata & dependencies
├── README.md               # Install & setup guide
└── chronicle_mcp/
    ├── server.py           # 5 MCP tools + resource docs
    ├── api.py              # HTTP client for hosted backend
    └── local.py            # In-process LangGraph fallback
```

**Entry point:** `python -m chronicle_mcp` or `chronicle-mcp`

---

## Slide 6 — MCP Tools Exposed

| Tool | Purpose |
|------|---------|
| `research_market` | Run full 5-agent pipeline on a query (sync or async) |
| `get_research_job` | Fetch job status + report by ID |
| `export_research_markdown` | Export completed job as markdown |
| `list_starter_queries` | Founder-style example queries |
| `chronicle_health` | API connectivity check |

**Resource:** `chronicle://docs/overview` — embedded pipeline documentation for the host LLM.

**Example prompt in Cursor:**
> "Use Chronicle to research the competitive landscape for AI legal research tools 2025."

---

## Slide 7 — Multi-Agent Pipeline (Model & Technique)

```
Query → Retriever → Enricher → Analyzer → Insight → Report
          │            │           │          │         │
          ▼            ▼           ▼          ▼         ▼
       Tavily +    metadata,   credibility  trend    cited
       Perplexity  sentiment   scoring,     chains   markdown
       + arXiv                 contradictions
```

**Orchestration:** LangGraph state machine  
**LLM routing:** OpenRouter — smallest capable model per agent

| Agent | Model | Why |
|-------|-------|-----|
| Retriever | GPT-4o Mini | Fast, cheap formatting |
| Analyzer | Claude 3.5 Sonnet | Strong reasoning for credibility |
| Insight | GPT-4o | Pattern matching & hypotheses |
| Report | Claude 3.5 Haiku | Consistent markdown assembly |

**Prompt engineering:** Per-agent system prompts, temperature tuning (0.1–0.7), structured JSON outputs for credibility scores and contradiction flags.

---

## Slide 8 — Data Sources

Chronicle does **live retrieval**, not fine-tuning on a fixed corpus.

| Source | Type | Role |
|--------|------|------|
| **Tavily** | Web search API | Primary retrieval |
| **Perplexity** | Search fallback | When Tavily is thin |
| **arXiv** | Academic papers | Technical / research queries |
| **News APIs** | Recent articles | Funding, regulatory, market news |

**At runtime:** 10–30 candidate sources per query → enriched → credibility-scored → contradictions surfaced → top claims synthesized into report.

---

## Slide 9 — Customization & Implementation Details

**Dual execution modes** (env: `CHRONICLE_MODE`)

| Mode | How it works | When to use |
|------|-------------|-------------|
| `remote` (default) | MCP → REST API on Fly.io | Zero local keys; production use |
| `local` | MCP → in-process LangGraph | Dev, custom agents, own API keys |

**Key implementation choices:**

1. **FastMCP** — declarative tool definitions with Pydantic field validation
2. **Thin MCP layer** — `api.py` is ~100 lines; server logic stays separate from agents
3. **Sync + async jobs** — `research_market(async_mode=True)` enqueues and polls
4. **Transport flexibility** — stdio (Cursor default) or HTTP (`PORT=8787`)
5. **Formatted output** — credibility avg, contradiction count, shareable job URL baked into tool response

---

## Slide 10 — Installation & IDE Integration

**Step 1 — Install**
```bash
pip install chronicle-mcp
# or from repo: pip install -e mcp/
```

**Step 2 — Cursor config** (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "chronicle": {
      "command": "python",
      "args": ["-m", "chronicle_mcp"],
      "env": {
        "CHRONICLE_API_URL": "https://multi-agent-deep-research-api.fly.dev"
      }
    }
  }
}
```

**Step 3 — Restart Cursor → "chronicle" appears under MCP tools**

Same config works for **Claude Desktop** (`claude_desktop_config.json`).

---

## Slide 11 — Deployment Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  DISTRIBUTION                                                │
│  PyPI: chronicle-mcp  ·  GitHub: multi-agent-deep-research   │
└──────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   Cursor (stdio)      Claude Desktop        HTTP :8787
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
              ┌───────────────────────────────┐
              │  Chronicle API (Fly.io)      │
              │  FastAPI + LangGraph + Redis   │
              └───────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   OpenRouter            Tavily / Perplexity    arXiv
   (LLM gateway)         (search)               (papers)
```

**Frontend:** Next.js on Vercel · **Backend:** Docker on Fly.io · **MCP:** stdio or HTTP

---

## Slide 12 — Demo Walkthrough

**Scenario:** Founder drafting a seed deck in Cursor.

1. Open Cursor with Chronicle MCP configured
2. Prompt: *"Research TAM for AI coding assistants — TAM, SAM, SOM 2025"*
3. `research_market` runs → 30–90s
4. Output includes:
   - Cited markdown report (TAM/SAM/SOM breakdown)
   - Average source credibility score
   - Contradictions flagged (e.g. conflicting market size estimates)
   - Shareable URL: `deep-research.intelliforge.tech/history/{job_id}`
5. Paste report section directly into pitch deck slide

---

## Slide 13 — Results

**Pipeline performance (optimized model routing)**

| Metric | Before (all GPT-4-Turbo) | After (per-agent routing) |
|--------|--------------------------|---------------------------|
| Cost per query | ~$0.28 | ~$0.05 |
| 10-query demo | ~$2.80 | ~$0.46 (**84% savings**) |
| Runtime | 30–90 seconds | Same, faster per-agent |

**Report quality signals**

- Every claim linked to a source with credibility score
- Contradictions surfaced explicitly (not hidden)
- Markdown export ready for decks / YC applications

**Case study benchmarks** (IntelliForge analytics engagement):
- 10× faster research output
- 80% cost reduction per report
- Fully automated citation generation

---

## Slide 14 — Conclusions

1. **MCP bridges the gap** between powerful multi-agent backends and the IDE where founders actually work
2. **`chronicle-mcp` is a thin, publishable package** — 4 Python modules, 5 tools, two transports, two execution modes
3. **Multi-agent > single-shot LLM** for founder research: retrieval, scoring, and contradiction handling are separate cognitive tasks
4. **Cost-aware model routing** makes the pipeline practical at scale (~$0.05/query vs ~$0.28)
5. **Open stack** — LangGraph, OpenRouter, Tavily, FastMCP — fully inspectable, no black box

---

## Slide 15 — Future Work

| Item | Status |
|------|--------|
| MCP server for Cursor / Claude Desktop | Done (`chronicle-mcp`) |
| Publish to PyPI (`pip install chronicle-mcp`) | Next |
| Persistent project workspaces | Planned |
| Export to Notion, Google Docs, Linear | Planned |
| Custom agent definitions (bring your own retrieval source) | Planned |
| Team workspaces with shared research history | Planned |

---

## Slide 16 — Q&A

**Chronicle MCP** · `pip install chronicle-mcp`

- Live demo: https://deep-research.intelliforge.tech
- API health: https://multi-agent-deep-research-api.fly.dev/api/health
- GitHub: https://github.com/gengirish/multi-agent-deep-research
- MCP setup: `mcp/README.md`

---

## Appendix — Viva Cheat Sheet

1. **What is MCP and why stdio?** — Standard protocol; stdio is how Cursor spawns subprocess tools securely.
2. **Remote vs local mode?** — Remote calls hosted API (no keys); local runs LangGraph in-process with your `.env`.
3. **Why five agents, not one prompt?** — Separation of retrieval, enrichment, analysis, insight, and report assembly; each step has different model/temperature needs.
4. **How is credibility scored?** — Analyzer agent evaluates source type, recency, authoritativeness; outputs structured scores per source.
5. **What data do you train on?** — No fine-tuning; live retrieval per query with RAG-style assembly.
6. **PyPI package structure?** — `pyproject.toml` → hatchling wheel → `chronicle_mcp` package → `chronicle-mcp` console script.

---

## Appendix — Demo Video Script (~8 min)

| Time | Segment |
|------|---------|
| 0:00–0:45 | Problem slide + show Cursor with MCP panel |
| 0:45–1:30 | `pip install` + show `mcp.json` config |
| 1:30–2:00 | `chronicle_health` — prove connectivity |
| 2:00–2:30 | `list_starter_queries` — show founder queries |
| 2:30–4:30 | `research_market` on live query — watch it run |
| 4:30–6:00 | Walk through output: citations, credibility, contradictions |
| 6:00–7:00 | Paste into a slide / show share URL on web app |
| 7:00–8:00 | Architecture diagram + wrap |
