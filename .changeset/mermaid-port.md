---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

Port `workflow_to_mermaid` from gxformat2 and expose as `gxwf mermaid`.

- `@galaxy-tool-util/schema`: new `workflowToMermaid(workflow, { comments? })` that renders a Mermaid flowchart string from any Format2 / native workflow input. Shapes inputs by type, strips the main toolshed prefix from tool IDs, deduplicates edges, and optionally renders frame comments as `subgraph` blocks.
- `@galaxy-tool-util/cli`: new `gxwf mermaid <file> [output] [--comments]` command. Writes raw `.mmd` by default; `.md` output path wraps the diagram in a fenced `mermaid` code block; stdout if no output path.
- Behavioral coverage driven by the declarative YAML suite synced from gxformat2 (`mermaid.yml` via `make sync-workflow-expectations`). Adds `value_matches` assertion mode to the shared declarative test harness.
