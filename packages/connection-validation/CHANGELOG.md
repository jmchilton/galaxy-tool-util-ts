# @galaxy-tool-util/connection-validation

## 1.10.0

### Patch Changes

- Updated dependencies [[`fdbed78`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/fdbed78dd2d47aca019f3ed967820c3cfe119f4a), [`3999c83`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3999c83e7436f439da26c552b151ac839bdbf6a5)]:
  - @galaxy-tool-util/schema@1.10.0

## 1.9.0

### Patch Changes

- Updated dependencies [[`d0f0cac`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d0f0cac5235a10de6b7da822137dd48af1fb71c3), [`df26076`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/df26076daa7c44ed223a98856b8d0eca04471901), [`ce78ceb`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ce78ceb24b05b26d506d2a642a8fc6b08bbc770c)]:
  - @galaxy-tool-util/schema@1.9.0

## 1.8.2

### Patch Changes

- Updated dependencies [[`2667764`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/2667764b8ec967aa15856c0dc522cac7d61edd4a)]:
  - @galaxy-tool-util/schema@1.8.2

## 1.8.0

### Patch Changes

- Updated dependencies [[`e7b6af5`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e7b6af5e700bc8438690131ec75cb1a070650601), [`5a97723`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/5a9772309b463c88f7f7576f5a7de1eca2a8f0f0), [`d11e393`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d11e3932c509f53efeeed69853f486cf36693785)]:
  - @galaxy-tool-util/schema@1.8.0

## 1.7.2

### Patch Changes

- Updated dependencies [[`25b6e15`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/25b6e15c797647e9f12a887a95c55c265fa30f3f)]:
  - @galaxy-tool-util/schema@1.7.2

## 1.7.1

### Patch Changes

- Updated dependencies [[`d15c5c0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d15c5c0543aca01901f34e28eda66ba1ac3a5242)]:
  - @galaxy-tool-util/schema@1.7.1

## 1.7.0

### Patch Changes

- Updated dependencies [[`d51a18b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d51a18b2f19ce5d3cce8fe8b6a4ff0053ac2af60), [`455fdcb`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/455fdcbcf8eaa6060f45dec9f4fbabd138252673), [`38ff7d2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/38ff7d2f235a34f81785768dd5299d8e1fbe76a1), [`8afd4d0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8afd4d064180231bdba0b386746deb48da44eeb8), [`0f36639`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0f36639ea065bb330c24c512224fb5e1ae74187e)]:
  - @galaxy-tool-util/schema@1.7.0

## 1.6.0

### Patch Changes

- Updated dependencies [[`ac53ba0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ac53ba0e0f38979dc70fc83763fa1f1c5ba8d5ec), [`ac53ba0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ac53ba0e0f38979dc70fc83763fa1f1c5ba8d5ec)]:
  - @galaxy-tool-util/schema@1.6.0

## 1.5.0

### Minor Changes

- [#103](https://github.com/jmchilton/galaxy-tool-util-ts/pull/103) [`9053be9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9053be9e54a8095bb950d1e57cd6b95134ec3578) Thanks [@jmchilton](https://github.com/jmchilton)! - Inline UDT resolver for connection validation (jmchilton/galaxy-tool-util-ts#101). Also refreshes the parsed_tools/ fixture cache to pick up new ParsedTool fields (`requirements`, `containers`, `stdio`) added upstream — incidental to this PR; the TS-side `ParsedTool` schema ignores them. TS port of Galaxy's `_inline_tool` module on the `wf_tool_state` branch: `@galaxy-tool-util/schema` now ships `parseInlineTool(repr)` (full port of `parse_tool(YamlToolSource(repr))` covering id/version/name/description, inputs, outputs, citations, license, profile, edam, xrefs, help). `@galaxy-tool-util/connection-validation` ships `resolveForStep`, `InlineResolver`, `ensureInlineResolver`, and `collectInlineTools`; `buildWorkflowGraph` wraps its resolver in an `InlineResolver` so inline `tool_representation` steps (with `class: GalaxyUserTool`) resolve without a remote lookup. `buildGetToolInfo` walks inline reps up-front and pre-parses them into the cache, surfacing parse errors via `onMiss` alongside ToolShed misses. Unblocks UDT fixtures in the connection-validation corpus (eight new fixtures pulled byte-identical from Galaxy's `wf_tool_state` branch).

### Patch Changes

- Updated dependencies [[`fcef54f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/fcef54fdc27d228040ae45aeec7019f32368e344), [`b8e61b0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b8e61b0e1908149a683e1c9b86876346e3ad325d), [`cda837c`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/cda837cbe95a64654c088c299bd2e6cb812dd7dd), [`44a437c`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/44a437c214b4de7947e6f3e0cbe8d5262b510451), [`001ded9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/001ded9a4cbe7f2a2ce3838ed4ee480bba8ad2a9), [`527b8b8`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/527b8b88e812219ae0a9965a4b3090d9c902575a), [`f63f210`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/f63f21094f24bacc36d9c18cd634c8790f285c57), [`1d53e62`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/1d53e628e4a1a6e771e090897194f72391087b2b), [`5b0b3be`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/5b0b3bed3892c965263b30e00b87e0d7140f34e3), [`9053be9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9053be9e54a8095bb950d1e57cd6b95134ec3578), [`f9e4ede`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/f9e4ede76a5e9353dd60009e3d5aa7523cd232fe), [`e4e46e0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e4e46e0e4625532363c2d10b9c3beeaa03d05ed4), [`22a982b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/22a982b28b1e028192cd892c96a629cb7112c7be), [`2bdd932`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/2bdd932e8dc0acc1010f94493fa7fbc7d2a4a16d), [`941ac0e`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/941ac0e3b373521db8814003cc9dcf5a7bb9115f), [`62dc8a7`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/62dc8a71ba284022e2be5bf607fcead523df0370), [`ae33d9d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ae33d9d6de39475e2646f2d8790ada7d12cfd676)]:
  - @galaxy-tool-util/schema@1.5.0

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
