# @galaxy-tool-util/connection-validation

## 1.2.0

### Minor Changes

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`8cfbe32`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8cfbe327f69ce09578ac49c3eff39282ba66c7fc) Thanks [@jmchilton](https://github.com/jmchilton)! - Encode map-over depth + reductions on workflow diagram edges.

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

- [#77](https://github.com/jmchilton/galaxy-tool-util-ts/pull/77) [`cc00008`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/cc00008fc42d637fc8a76eeb41eab038a7b0408a) Thanks [@jmchilton](https://github.com/jmchilton)! - New package `@galaxy-tool-util/connection-validation` — port of
  `galaxy.tool_util.workflow_state.connection_validation`. Walks a typed
  workflow graph in topological order, validates each connection against
  collection-type algebra, and produces a snake_case
  `ConnectionValidationReport` matching Galaxy's Pydantic shape verbatim.
  All 26 connection-workflow fixtures + 19 sidecar `target/value`
  expectations pass.

  `gxwf validate --connections` runs the connection validator and attaches
  the resulting report to the JSON output (`connection_report`). Mirrors
  Python's opt-in `--connections` flag (default off).

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`505fefa`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/505fefaead84dcf632695de678ce35d728cd58fa) Thanks [@jmchilton](https://github.com/jmchilton)! - Lift `collectToolRefs` and `buildGetToolInfo` from `@galaxy-tool-util/cli` into
  `@galaxy-tool-util/connection-validation` so browsers (and any future
  non-Node consumer) can drive the same preload-then-validate pipeline the CLI
  uses.
  - `connection-validation`: new exports `collectToolRefs`, `buildGetToolInfo`,
    and types `ToolRef`, `AsyncToolFetcher`, `BuildGetToolInfoOptions`. The
    lifted helper takes an `AsyncToolFetcher` callback (browser caches and CLI
    ToolCaches both fit) and supports optional `concurrency` (default 1, matching
    the CLI's prior behavior), `onMiss`, and `onProgress` callbacks. The
    version-negotiation contract (`lookupKey` + first-by-tool-id fallback) moves
    with the helper so CLI and future browser callers can't drift.
  - `cli`: `commands/connection-validation.ts` collapses to a thin adapter that
    wires the on-disk `ToolCache` into the lifted helper via `loadCachedTool`.
    External API (`buildConnectionReport`, `buildGetToolInfo`, `collectToolRefs`,
    `ToolRef`) is unchanged.

### Patch Changes

- Updated dependencies [[`8261f8d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8261f8d95040ad76a053ce3bf5048de53c41dda9), [`0124600`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0124600f0cd42210f20989c6626ece034d13dfe5), [`016385b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/016385bb0e40a9cbe1f6c55d9d18829917914df0), [`8cfbe32`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8cfbe327f69ce09578ac49c3eff39282ba66c7fc), [`ee543b5`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ee543b522c9181f0920969746e271e986fea3249), [`e3ba439`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e3ba439976a703785ee93c5e4d69bb1f2e873ce5)]:
  - @galaxy-tool-util/schema@1.2.0
  - @galaxy-tool-util/workflow-graph@1.2.0
