# Docs

| Document | What it is |
| -------- | ---------- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | How the system fits together and why — pipeline, model routing, MCP surfaces, security controls |
| [`diagrams/`](./diagrams/) | The architecture diagram: `chronicle.architecture.html` (interactive, self-contained), themed SVG/PNG for the README, and `chronicle.architecture.json` — the Archify spec both are generated from |
| [`SCHEDULED_BRIEFINGS.md`](./SCHEDULED_BRIEFINGS.md) | Running Chronicle unattended — where the schedule can live, the claude.ai scheduler prompt, and the broadcast safety model |
| [`CONNECTOR_HANDOVER.md`](./CONNECTOR_HANDOVER.md) | Historical record of shipping the claude.ai remote connector, with end-to-end verification results. Complete; kept as the re-run procedure |
| [`mtech-demo-runbook.md`](./mtech-demo-runbook.md) | Speaker runbook for the MTech demo |
| [`chronicle-mcp-slides.md`](./chronicle-mcp-slides.md) | Slide source for the Chronicle MCP presentation |

Top-level docs live in the repo root:

- [`../README.md`](../README.md) — what Chronicle is, and how to run it
- [`../QUICK_START.md`](../QUICK_START.md) — the fastest local setup path
- [`../DEPLOYMENT.md`](../DEPLOYMENT.md) — Vercel + Fly.io, the MCP connector, newsletter broadcast
- [`../CHANGELOG.md`](../CHANGELOG.md) — notable changes
- [`../TODO.md`](../TODO.md) — open items and known gaps
- [`../env.example`](../env.example) — authoritative environment variable reference
