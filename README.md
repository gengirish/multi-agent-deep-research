<div align="center">

# Chronicle

**AI research copilot for founders.**

Customer discovery, market sizing, competitive intel — in minutes, with citations you can defend.

[**Live demo →**](https://deep-research.intelliforge.tech) &nbsp;·&nbsp;
[API](https://multi-agent-deep-research-api.fly.dev/api/health) &nbsp;·&nbsp;
[About](https://deep-research.intelliforge.tech/about) &nbsp;·&nbsp;
[Source](https://github.com/gengirish/multi-agent-deep-research)

[![Live demo](https://img.shields.io/badge/live%20demo-deep--research.intelliforge.tech-22c55e?logo=vercel&logoColor=white)](https://deep-research.intelliforge.tech)
[![Frontend on Vercel](https://img.shields.io/badge/frontend-Next.js%20on%20Vercel-000?logo=nextdotjs&logoColor=white)](https://deep-research.intelliforge.tech)
[![Backend on Fly.io](https://img.shields.io/badge/backend-Fly.io-7b3fe4?logo=flydotio&logoColor=white)](https://multi-agent-deep-research-api.fly.dev)
[![PWA installable](https://img.shields.io/badge/PWA-installable-5a45ff?logo=pwa&logoColor=white)](https://deep-research.intelliforge.tech)
[![Python 3.11](https://img.shields.io/badge/python-3.11-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![GitHub repo](https://img.shields.io/badge/source-github.com%2Fgengirish%2Fmulti--agent--deep--research-181717?logo=github)](https://github.com/gengirish/multi-agent-deep-research)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

</div>

---

## What it does

Founders run the same five research questions over and over — market sizing, competitive landscape, customer discovery, regulatory intel, recent funding activity. The current options are all bad: ChatGPT hallucinates citations, Perplexity gives you a paragraph instead of a report, and a real analyst costs $5k a week.

Chronicle runs the question through a **multi-agent pipeline** that searches the web, papers, and news; **scores every source** for credibility; **flags contradictions**; and assembles a **cited markdown report** you can paste into a deck or send to YC.

It shows its work. Every step the agents take is visible, recorded, and replayable.

## Try it

```
https://multi-agent-deep-research-eight.vercel.app
```

No signup. No API key. Click a starter query, watch the five agents run, get a cited report.

## How it works

```
Query  →  Retriever  →  Enricher  →  Analyzer  →  Insight  →  Report
            │              │             │            │           │
            ▼              ▼             ▼            ▼           ▼
        Tavily +        metadata,    credibility    trend       cited
        Perplexity      sentiment,   scoring,       chains,     markdown
        + ArXiv         dates        contradictions hypotheses  report
```

Five specialized agents, orchestrated as a [LangGraph](https://github.com/langchain-ai/langgraph) state machine. The frontend streams progress over Server-Sent Events so you watch the chain assemble live.

| Agent              | Job                                                                          |
| ------------------ | ---------------------------------------------------------------------------- |
| **Retriever**      | Pulls candidate sources from web search, news APIs, and arXiv.               |
| **Enricher**       | Adds metadata, dates, source-type classifications, and sentiment.            |
| **Analyzer**       | Scores credibility, surfaces contradictions, extracts load-bearing claims.   |
| **Insight**        | Turns claims into hypotheses, trend chains, and reasoning steps.             |
| **Report builder** | Compiles everything into a structured, cited markdown report.                |

## Stack

| Layer        | Tech                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| Frontend     | React 18, Vite, TypeScript, D3 (visualizations)                         |
| Backend      | FastAPI, uvicorn, LangChain, LangGraph                                  |
| Models       | OpenRouter (GPT-4o-mini, Claude 3.5 Sonnet, Claude 3.5 Haiku, GPT-4o)   |
| Search       | Tavily (primary), Perplexity (fallback), ArXiv                          |
| Hosting      | Vercel (frontend), Fly.io (backend, container)                          |

The model mix is cost-optimized: routing each agent to the smallest model that does the job well. ~84% cheaper than running everything on GPT-4-Turbo, with better analysis quality (see `CHANGELOG.md`).

## Run it locally

### Backend

```bash
python -m venv venv && source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp env.example .env
# edit .env: OPEN_ROUTER_KEY (required), TAVILY_API_KEY (recommended), PERPLEXITY_API_KEY (optional fallback)
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Open http://localhost:5173.

### With Docker

```bash
docker compose up
```

## Deploy

The live deployment uses Vercel + Fly.io. Both are CLI-driven; full walk-through in [`DEPLOYMENT.md`](./DEPLOYMENT.md).

```bash
fly deploy --app <your-app-name> --remote-only          # backend
vercel --prod --yes                                     # frontend
```

The repo is platform-agnostic — anything that can run a Python ASGI container will host the backend. See `Dockerfile` and `fly.toml`.

## Project layout

```
.
├── agents/                 # Retriever, enricher, analyzer, insight, reporter
├── orchestration/          # LangGraph workflow (coordinator.py)
├── utils/                  # LLM config, RAG service, agent logging
├── backend/                # FastAPI server (main.py)
├── frontend/               # React + Vite app
│   ├── src/pages/landing/  # Public marketing page
│   ├── src/pages/research/ # The actual product
│   └── src/components/     # Including D3-based visualizations
├── Dockerfile              # Backend container (used by Fly.io)
├── fly.toml                # Fly.io deployment config
├── docker-compose.yml      # Local dev stack
└── DEPLOYMENT.md           # Step-by-step deploy guide
```

## Configuration

| Variable             | Required | Purpose                                          |
| -------------------- | :------: | ------------------------------------------------ |
| `OPEN_ROUTER_KEY`    |    ✅    | LLM access via OpenRouter                        |
| `TAVILY_API_KEY`     |    ➖    | Web search (recommended; falls back if missing)  |
| `PERPLEXITY_API_KEY` |    ➖    | Search fallback                                  |
| `ALLOWED_ORIGINS`    |    ➖    | Comma-separated CORS allowlist                   |
| `ENVIRONMENT`        |    ➖    | Free-form environment label                      |
| `PORT`               |    ➖    | Server port (host injects in production)         |

`*.vercel.app` preview origins are auto-allowed via regex in `backend/main.py`.

## Roadmap

- [ ] Persistent project workspaces (save and revisit research threads)
- [ ] Direct export to Notion, Google Docs, and Linear
- [ ] Custom agent definitions (bring your own retrieval source)
- [ ] Team workspaces with shared research history
- [ ] Embedded citation viewer (Hebbia-style side-by-side)

## Contributing

Open an [issue](https://github.com/gengirish/multi-agent-deep-research/issues) or [PR](https://github.com/gengirish/multi-agent-deep-research/pulls). The code is intentionally small enough to read end-to-end in an afternoon.

## License

MIT — see header of source files. Use it, fork it, ship it.

---

<div align="center">

**Made by founders, for founders.** &nbsp;·&nbsp; [Live demo](https://deep-research.intelliforge.tech) &nbsp;·&nbsp; [GitHub](https://github.com/gengirish/multi-agent-deep-research)

</div>
