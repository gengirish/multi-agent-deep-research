# Diagrams

The architecture diagram embedded in the [root README](../../README.md#architecture).

| File | What it is |
| ---- | ---------- |
| `chronicle.architecture.json` | The source of truth — a typed [Archify](https://github.com/tt-a1i/archify) spec. Edit this, never the outputs. |
| `chronicle.architecture.html` | Self-contained interactive viewer: search, route tracing, guided views, light/dark, and per-node links to the source line on GitHub. No network dependencies. |
| `chronicle-architecture-{dark,light}.svg` | Standalone vector export, one per theme. |
| `chronicle-architecture-{dark,light}.png` | 2× raster of the same, for the README `<picture>` block. |
| `chronicle.architecture.visual-check.json` | Browser-evidence receipt from the last delivery. |

## Regenerating

Install [Archify](https://github.com/tt-a1i/archify) (MIT, no runtime dependencies — it is
not vendored here), then run both commands from the repo root:

```bash
npx skills add tt-a1i/archify -g
ARCHIFY=~/.claude/skills/archify/bin/archify.mjs

node $ARCHIFY validate architecture \
  docs/diagrams/chronicle.architecture.json --quality showcase --repo-root . --json

node $ARCHIFY deliver architecture \
  docs/diagrams/chronicle.architecture.json docs/diagrams/chronicle.architecture.html \
  --quality showcase --repo-root . --json
```

The diagram was generated with Archify 2.17. `deliver` must exit 0 with 9/9 artifact checks
and 0 warnings before the output is trusted.

`--repo-root .` is required: the spec declares source evidence, and Archify verifies every
`sources` path against the working tree before it will render.

The SVG and PNG exports are derived from the delivered HTML — the diagram's inline `<svg>`
plus its stylesheet, with the `@media print` block and the viewer-chrome rules dropped, the
CSS wrapped in `CDATA`, and `data-theme` set on the SVG root.

## Keeping it honest

`meta.repository.revision` pins the commit the source links point at. When components move
or the topology changes, update the spec and the revision together — a diagram that
silently drifts from the code is worse than no diagram.
