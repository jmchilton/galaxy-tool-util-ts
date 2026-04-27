---
"@galaxy-tool-util/connection-validation": minor
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

Encode map-over depth + reductions on workflow diagram edges.

Phase B of the workflow visualization plan. Threads connection-validation
results into the mermaid and cytoscape emitters so edges visually distinguish
mapped, list-paired-mapped, and reducing connections.

- `connection-validation`: `ConnectionValidationResult` gains `mapDepth` /
  `reduction` (also surfaced as `map_depth` / `reduction` in
  `ConnectionResult`); `StepConnectionResult` gains an optional `label`. New
  `buildEdgeAnnotations(report)` returns a `Map<string, EdgeAnnotation>`
  keyed by step labels for emitter consumption.
- `schema`: `MermaidOptions.edgeAnnotations` and a new
  `CytoscapeOptions.edgeAnnotations` thread the lookup into emit. Mermaid
  draws thick `==>|"<mapping>"|` for map-over edges and dashed
  `-. "reduce" .->` for reductions, with a consolidated `linkStyle` block.
  Cytoscape edges gain `data.map_depth` / `data.reduction` / `data.mapping`
  plus `mapover_<n>` / `reduction` classes; the bundled HTML viewer styles
  these and shows depth/reduction in edge tooltips.
- `cli`: `gxwf mermaid` and `gxwf cytoscapejs` accept
  `--annotate-connections` (with `--cache-dir`) — opt-in; default emit shape
  stays byte-identical with Python.

Note: `map_depth` / `reduction` on `ConnectionResult` are TS-only enrichments
ahead of a planned Galaxy Python parity addition.
