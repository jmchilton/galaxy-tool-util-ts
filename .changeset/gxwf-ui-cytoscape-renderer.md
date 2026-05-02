---
"@galaxy-tool-util/gxwf-ui": minor
---

Workflow diagram view now supports a runtime renderer swap between Mermaid
and Cytoscape, plus a "Map/reduce" toggle that threads connection-validation
edge annotations into both renderers.

The Cytoscape view dynamic-imports `cytoscape` + `cytoscape-dagre` (so it
costs nothing for users staying on Mermaid), auto-detects whether to use
the workflow's editor positions (`preset`) or auto-layout (`dagre`), and
ships a theme-aware stylesheet that updates when the document toggles
dark/light. Both choices persist across sessions in `localStorage`.

Edge annotations run client-side via the connection validator with a no-op
tool-info lookup — annotations land for whatever the workflow declares
structurally; richer fidelity (full tool input/output specs) can be wired
later via a `gxwf-web` tool-info endpoint without touching this surface.
