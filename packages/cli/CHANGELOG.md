# @galaxy-tool-util/cli

## 1.2.0

### Minor Changes

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`8261f8d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8261f8d95040ad76a053ce3bf5048de53c41dda9) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `--layout <name>` to `gxwf cytoscapejs` (and the underlying
  `cytoscapeElements({ layout })` builder option).

  `preset` (default) keeps today's coordinate-from-NF2 emission byte-for-byte,
  including the Python `(10*i, 10*i)` fallback. `topological` overwrites every
  node's `position` using a small longest-path layering algorithm — pinned in
  `docs/architecture/cytoscape-layout.md` so the gxformat2 port can land
  byte-equal coordinates. Hint-only layouts (`dagre`, `breadthfirst`, `grid`,
  `cose`, `random`) drop `data.position` and emit a top-level
  `layout: { name: "<n>" }` hint that the bundled HTML viewer (now ships
  `cytoscape-dagre`) and `gxwf-ui` honor at view time.

  JSON output gains a `{ elements, layout }` wrapper when `--layout` is
  non-default. The default `preset` flow continues to write a bare list for
  Python parity.

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`0124600`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0124600f0cd42210f20989c6626ece034d13dfe5) Thanks [@jmchilton](https://github.com/jmchilton)! - Port gxformat2's `gxwf-viz` to TS as `gxwf cytoscapejs`.
  - `@galaxy-tool-util/schema` exports `cytoscapeElements()` + `elementsToList()` plus
    output-only TS interfaces (`CytoscapeNode`, `CytoscapeEdge`, `CytoscapeElements`, …).
    Snake_case field names + edge-id format are preserved byte-for-byte with the
    Python emitter so the JSON is interchangeable.
  - `gxwf cytoscapejs <file> [output]` (`--html` / `--json`) renders a workflow as
    Cytoscape.js JSON or a standalone HTML viewer. Defaults to stdout JSON when no
    output path is given (diverges from Python's "write `.html` next to input").
  - The HTML template is synced verbatim from gxformat2 via the new
    `cytoscape-template` group in `scripts/sync-manifest.json` and bundled into
    the CLI dist as a string constant.
  - 13 declarative parity cases (synced `cytoscape.yml`) run against the TS
    builder via the existing harness — no sidecar JSON goldens.

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`da95cb0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/da95cb08da77ada269ca690339cdba04d1de1343) Thanks [@jmchilton](https://github.com/jmchilton)! - Auto-dispatch + hybrid endpoint for workflow edge annotations.

  `gxwf-ui` `WorkflowDiagram` now drives annotations through the new
  `useEdgeAnnotationsAuto` composable: probes `GET /healthz` for the
  `edge-annotations` feature on the first build, caches the decision in
  `sessionStorage` (`gxwf-ui:annotations-mode`), and falls back to the
  client-side composable on probe failure or post-decision server failure
  (network / 5xx / CORS). `VITE_GXWF_EDGE_ANNOTATIONS_MODE=server|client`
  pins the transport for static deploys that know the answer up front.

  `gxwf-web` `POST /workflows/{path}/edge-annotations` now returns
  `{ annotations, tool_specs }`; `tool_specs` is keyed by
  `${tool_id}@${tool_version}` and carries the `ParsedTool` specs the
  validator consumed. Co-resident browsers write these into the IndexedDB
  cache via `useToolInfoService.addTool`, so the next workflow load —
  whether server-routed or client-side — hits a warm cache and avoids a
  second cold-start fanout to ToolShed. Older `gxwf-web` builds that return
  the bare `Record<edgeKey, EdgeAnnotation>` are still consumed correctly;
  the UI detects the envelope shape and ignores legacy responses.

  `@galaxy-tool-util/cli` exports `resolveEdgeAnnotationsAndSpecsWithCache`
  - `ResolvedToolSpec` to support the hybrid response. `gxwf-web`'s
    existing `operateEdgeAnnotations` now uses it; the original
    `resolveEdgeAnnotationsWithCache` is unchanged.

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

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`673948b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/673948b7629bbe8a698b3eb1b49c44177415eeab) Thanks [@jmchilton](https://github.com/jmchilton)! - `gxwf-web` adds two new endpoints:
  - `POST /workflows/{path}/edge-annotations` — server-side edge annotation
    resolution (map-over depth + reductions) backed by the workspace tool
    cache. Powers the gxwf-ui map/reduce overlay without the browser doing
    ToolShed fetches.
  - `GET /healthz` — liveness probe returning `{ status, features }`. The
    `features` array advertises capabilities (`edge-annotations`) for clients
    that want to detect the server before falling back to a client-side path.

  To support the route, `@galaxy-tool-util/cli` exposes
  `resolveEdgeAnnotationsWithCache(data, cache)` so the gxwf-web handler can
  share the CLI's annotate-connections pipeline against an externally-owned
  `ToolCache`.

- [#86](https://github.com/jmchilton/galaxy-tool-util-ts/pull/86) [`60e314a`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/60e314aba242fb327716a62619b292cafb4d4dd8) Thanks [@jmchilton](https://github.com/jmchilton)! - Invert CLI metadata: spec-driven commander, no codegen.

  `spec/gxwf.json` and `spec/galaxy-tool-cache.json` are now the source of truth for the command surface. `buildGxwfProgram()` and `buildGalaxyToolCacheProgram()` build commander programs at runtime from those specs plus a small handler registry. The `_generated.ts` artifact and `scripts/generate-cli-meta.mjs` are gone; build is a single `tsc` (no double-compile).

  `@galaxy-tool-util/cli/meta` keeps its existing `gxwfCliMeta` / `galaxyToolCacheCliMeta` exports (`CliProgramSpec` shape, derived from the specs by a commander-free walker) and additionally re-exports the raw `gxwfSpec` / `galaxyToolCacheSpec`. The subpath stays browser-safe — no commander, no node-only imports.

### Patch Changes

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

- Updated dependencies [[`0826f95`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0826f95e1c05005860c0e45a9794d8bad068d51d), [`6fec560`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/6fec560edbc19b1ba4d535bd64610efcc3d904b0), [`8261f8d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8261f8d95040ad76a053ce3bf5048de53c41dda9), [`0124600`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0124600f0cd42210f20989c6626ece034d13dfe5), [`016385b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/016385bb0e40a9cbe1f6c55d9d18829917914df0), [`8cfbe32`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8cfbe327f69ce09578ac49c3eff39282ba66c7fc), [`cc00008`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/cc00008fc42d637fc8a76eeb41eab038a7b0408a), [`505fefa`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/505fefaead84dcf632695de678ce35d728cd58fa), [`86af88e`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/86af88e0162bbff6d1941f6556e2edd0070a0321), [`ee543b5`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ee543b522c9181f0920969746e271e986fea3249)]:
  - @galaxy-tool-util/core@1.2.0
  - @galaxy-tool-util/schema@1.2.0
  - @galaxy-tool-util/connection-validation@1.2.0
  - @galaxy-tool-util/search@1.2.0

## 1.1.0

### Minor Changes

- [#68](https://github.com/jmchilton/galaxy-tool-util-ts/pull/68) [`3b97a0f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3b97a0f41c2358aa663df4e6490488e89c9ba9e5) Thanks [@jmchilton](https://github.com/jmchilton)! - UI polish: auto-preview for clean/export/convert with explicit apply buttons (no more dry-run toggle). Lint report now surfaces error/warning messages alongside counts via new `lint_error_messages` / `lint_warning_messages` fields on `SingleLintReport`.

- [#72](https://github.com/jmchilton/galaxy-tool-util-ts/pull/72) [`54a9f93`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54a9f939ee25195b804cb7b2ed1e598cad97b5ca) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `gxwf tool-revisions <tool-id>` for resolving a Tool Shed tool to the
  changeset revisions that publish it — needed for emitting workflows pinned
  on `(name, owner, changeset_revision)` for reproducible reinstall.
  - Accepts both `owner~repo~tool_id` and `owner/repo/tool_id` forms.
  - `--tool-version <v>` restricts to revisions that publish that exact tool
    version.
  - `--latest` prints only the newest matching revision (per
    `get_ordered_installable_revisions` order).
  - `--json` emits `{ trsToolId, version?, revisions: [{ changesetRevision,
toolVersion }] }`. Exit codes: `0` on hits, `2` on empty, `3` on fetch
    error.

  Exports `getToolRevisions(toolshedUrl, { owner, repo, toolId, version? })`
  from `@galaxy-tool-util/search` for non-CLI consumers. Implementation uses
  the 3-call dance over `/api/repositories?owner=…&name=…`,
  `/api/repositories/{id}/metadata?downloadable_only=true`, and
  `get_ordered_installable_revisions` — no Tool Shed change required.

- [#72](https://github.com/jmchilton/galaxy-tool-util-ts/pull/72) [`944d671`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/944d6719028566e0a3231bc76cb603ed9fd03346) Thanks [@jmchilton](https://github.com/jmchilton)! - Tool Shed discovery quality-of-life improvements.

  `gxwf tool-search` gains client-side `--owner <user>` and `--match-name`
  filters (the Tool Shed has no server-side `owner:` keyword on
  `/api/tools`), plus a `--page <n>` flag to start paging beyond page 1.

  `gxwf tool-search --enrich` resolves each hit's `ParsedTool` via the
  shared tool-info cache and inlines it as `parsedTool` on each JSON hit,
  so skills that pick the top 1–3 results can skip the follow-up
  `galaxy-tool-cache add` round trip. Off by default; one fetch per hit.

  New `gxwf repo-search <query>` command queries `/api/repositories?q=`
  with server-side `owner:` / `category:` reserved keywords. Repository
  search ranks by popularity (`times_downloaded`) and is better suited
  for "find me a package about X" queries; tool-search remains the
  right tool for exact tool-name lookups.

  Exports `searchRepositories`, `iterateRepoSearchPages`, and
  `buildRepoQuery` from `@galaxy-tool-util/search` for non-CLI consumers,
  along with the `RepositorySearchHit` wire type and
  `normalizeRepoSearchResults` validator.

- [#67](https://github.com/jmchilton/galaxy-tool-util-ts/pull/67) [`25104d3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/25104d395f17ed6e84cc7a214fb193349e5141f8) Thanks [@jmchilton](https://github.com/jmchilton)! - Add Tool Shed discovery commands to `gxwf`:
  - `gxwf tool-search <query>` — search the Tool Shed (`toolshed.g2.bx.psu.edu`).
    Prints a tabular listing by default; `--json` emits a `{ query, hits }`
    envelope. Exit codes: `0` on hits, `2` on empty, `3` on fetch error.
  - `gxwf tool-versions <tool-id>` — list TRS-published versions (newest last),
    accepting both `owner~repo~tool_id` and `owner/repo/tool_id` forms.
    `--latest` prints only the latest version. Same exit-code convention.

  Exports `normalizeHit` from `@galaxy-tool-util/search` so single-source
  callers can paginate with `iterateToolSearchPages` and normalize hits
  without instantiating `ToolSearchService`.

### Patch Changes

- Updated dependencies [[`3b97a0f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3b97a0f41c2358aa663df4e6490488e89c9ba9e5), [`11a6625`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/11a66254a6c1c2640954ab4fbc41c59b0add0617), [`54a9f93`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54a9f939ee25195b804cb7b2ed1e598cad97b5ca), [`944d671`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/944d6719028566e0a3231bc76cb603ed9fd03346), [`25104d3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/25104d395f17ed6e84cc7a214fb193349e5141f8)]:
  - @galaxy-tool-util/schema@1.1.0
  - @galaxy-tool-util/search@1.1.0
  - @galaxy-tool-util/core@1.1.0

## 1.0.0

### Minor Changes

- [#66](https://github.com/jmchilton/galaxy-tool-util-ts/pull/66) [`7b835d2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7b835d298c4863ac0573e9091f4b1b8c72c34fef) Thanks [@jmchilton](https://github.com/jmchilton)! - Port `workflow_to_mermaid` from gxformat2 and expose as `gxwf mermaid`.
  - `@galaxy-tool-util/schema`: new `workflowToMermaid(workflow, { comments? })` that renders a Mermaid flowchart string from any Format2 / native workflow input. Shapes inputs by type, strips the main toolshed prefix from tool IDs, deduplicates edges, and optionally renders frame comments as `subgraph` blocks.
  - `@galaxy-tool-util/cli`: new `gxwf mermaid <file> [output] [--comments]` command. Writes raw `.mmd` by default; `.md` output path wraps the diagram in a fenced `mermaid` code block; stdout if no output path.
  - Behavioral coverage driven by the declarative YAML suite synced from gxformat2 (`mermaid.yml` via `make sync-workflow-expectations`). Adds `value_matches` assertion mode to the shared declarative test harness.

### Patch Changes

- Updated dependencies [[`afcd804`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/afcd804e03dacffd03821c3f75e2cae4a0340400), [`7b835d2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7b835d298c4863ac0573e9091f4b1b8c72c34fef), [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941), [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941), [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941)]:
  - @galaxy-tool-util/schema@1.0.0
  - @galaxy-tool-util/core@1.0.0

## 0.4.0

### Patch Changes

- [#56](https://github.com/jmchilton/galaxy-tool-util-ts/pull/56) [`8404313`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8404313159eb3950fefbb4c6c2ad2c7ddc79eef5) Thanks [@jmchilton](https://github.com/jmchilton)! - Port linting-abstraction overhaul from gxformat2 (`adabd80..0aaf7ce`).

  **Structured `LintMessage`.** `LintContext.errors` / `warnings` are now
  `LintMessage[]` — each carries `message`, `level`, `linter`, and
  `json_pointer` alongside the prose. `toString()` returns the message so
  template interpolation (`${m}`) and existing string-like callers keep
  working. Primitives extracted into `packages/schema/src/workflow/linting.ts`
  mirroring Python's `linting.py`.

  **`Linter` base + pilot rule.** New `lint-rules.ts` carries metadata-only
  `Linter` subclasses. `NativeStepKeyNotInteger` is the first live rule, wired
  through `lint.ts` with `linter=` and `json_pointer=` options. `LintContext.child()`
  composes RFC 6901 JSON pointers instead of prefixing message text.

  **Lint profile catalog.** `lint_profiles.yml` (structural / best-practices /
  release) synced from gxformat2 via new `sync-lint-profiles` Makefile target
  and `lint-profiles` group in `scripts/sync-manifest.json`. Loader
  `parseLintProfiles` + helpers (`lintProfilesById`, `rulesForProfile`,
  `iwcRuleIds`, `IWC_PROFILE_NAMES`) re-exported from the package entry.
  YAML copied into `dist/` by `copy-schema-assets.mjs` so runtime consumers
  can load it from the published package.

  **Tests.** New `lint-context.test.ts` (mirrors `test_linting.py`) and
  `lint-profiles.test.ts` (mirrors `test_lint_profiles.py`). Declarative
  expectation assertions `[errors, 0, linter]` and `[errors, 0, json_pointer]`
  flow through the existing path navigator unchanged; `assertValueContains` /
  `assertValueAnyContains` coerce `LintMessage` objects via `.message` so
  prior string-based expectations remain green.

- [#56](https://github.com/jmchilton/galaxy-tool-util-ts/pull/56) [`f4ea125`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/f4ea12548ffe1a69f33970cd8de18b76cbe2e744) Thanks [@jmchilton](https://github.com/jmchilton)! - Add schema-rule catalog port from gxformat2.

  Mirrors gxformat2 commit `4b6ecd6`: synced `schema_rules.yml` describes
  decode-enforced checks with positive/negative fixtures and lax/strict scope.
  New `packages/schema/test/schema-rules-catalog.test.ts` parametrizes validation
  over the catalog (22 cases across 7 rules) and enforces integrity: every rule
  has positive + negative fixtures, fixture extensions match `applies_to`,
  referenced fixtures exist on disk and are covered by `scripts/sync-manifest.json`.

  Shared Effect-schema validator dispatch lifted into
  `src/workflow/validators.ts` and re-exported from the package entry point:
  `validateFormat2{,Strict}`, `validateNative{,Strict}`, `validatorForFixture`,
  and `withClass`. The `withClass` helper (class-discriminator injection, recursive
  over `.subworkflow` and format2 `.run` inline subworkflows) replaces ad-hoc
  copies in `validate-workflow.ts`, `validate-workflow-json-schema.ts`, and
  `strict-checks.ts`.

  The synced YAML catalog is now copied into `dist/` by a new
  `scripts/copy-schema-assets.mjs` build step so runtime consumers (future
  `--list-rules`, tooling) can load it from the published package.

  New Makefile target `sync-schema-rules` (and `check-sync-schema-rules`) keeps
  the catalog in lockstep with the upstream gxformat2 source.

- Updated dependencies [[`8404313`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8404313159eb3950fefbb4c6c2ad2c7ddc79eef5), [`f4ea125`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/f4ea12548ffe1a69f33970cd8de18b76cbe2e744)]:
  - @galaxy-tool-util/schema@0.4.0

## 0.3.0

### Minor Changes

- [#37](https://github.com/jmchilton/galaxy-tool-util-ts/pull/37) [`3826da3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3826da31ccfc8c24ec9ebee85306e4b8fffb15dd) Thanks [@jmchilton](https://github.com/jmchilton)! - Integrate gxwf-report-shell with CLI report output (Phases 1–4).

  **gxwf-report-shell**: Fix dep direction — switch from `@galaxy-tool-util/gxwf-client` to `@galaxy-tool-util/schema` for all `Single*Report` types. Add four tree-level report components (`TreeValidationReport`, `TreeLintReport`, `TreeCleanReport`, `TreeRoundtripReport`). Extend `ReportShell.vue` and `shell.ts` to dispatch on `validate-tree`, `lint-tree`, `clean-tree`, `roundtrip-tree` types. The same CDN IIFE bundle now renders both single-workflow and tree reports.

  **cli**: Add `--report-html [file]` to `validate`, `lint`, and `clean` single-workflow commands. Add CDN-based HTML output (`buildReportHtml` / `writeReportHtml`) to all four tree commands (`validate-tree`, `lint-tree`, `clean-tree`, `roundtrip-tree`). Tree `--report-html` now uses the Vue shell; `--report-markdown` keeps Nunjucks. Rename `SingleReportType` → `ReportType`, `buildSingleReportHtml` → `buildReportHtml`, `writeSingleReportHtml` → `writeReportHtml`. Remove dead Nunjucks HTML path (`getHtmlEnv`, `_macros.html.j2`).

  **gxwf-ui**: Switch `useOperation.ts` from `gxwf-client` OpenAPI types to `@galaxy-tool-util/schema` types at API response boundaries.

- [#45](https://github.com/jmchilton/galaxy-tool-util-ts/pull/45) [`54fc8f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54fc8f20720030cdbf690fd6e72066d7958fc9b5) Thanks [@jmchilton](https://github.com/jmchilton)! - Expose fine-grained strict options, clean-first validation, JSON-schema mode, and before/after workflow content in the gxwf-web server and report UI.

  **`@galaxy-tool-util/schema`**
  - `SingleCleanReport` += `before_content?: string | null`, `after_content?: string | null`
  - `SingleRoundTripReport` += `before_content?: string | null`, `after_content?: string | null`
  - `SingleValidationReport` += `clean_report?: SingleCleanReport | null`
  - `RoundtripResult` += `reimportedWorkflow?: unknown` (populated by `roundtripValidate` on success)

  **`@galaxy-tool-util/cli`**
  - New export: `decodeStructureErrorsJsonSchema(data, format)` — AJV-based structural error decoder matching the `decodeStructureErrors` signature
  - New exports: `validateNativeStepsJsonSchema`, `validateFormat2StepsJsonSchema` re-exported from CLI index

  **`@galaxy-tool-util/gxwf-web`**
  - `ValidateOptions`: replaced `strict` with `strict_structure` + `strict_encoding`; added `clean_first` (runs clean in-memory before validation, embeds `clean_report`) and `mode` (routes to AJV path when `"json-schema"`)
  - `LintOptions`: replaced `strict` with `strict_structure` + `strict_encoding`
  - `CleanOptions` += `include_content` — populates `before_content`/`after_content` on the returned report
  - New `RoundtripOptions` interface with `strict_structure`, `strict_encoding`, `strict_state`, `include_content`
  - `openapi.json` regenerated from Python FastAPI server; `api-types.ts` regenerated via `pnpm codegen`

  **`@galaxy-tool-util/gxwf-report-shell`**
  - `CleanReport.vue`: shows collapsed "Workflow content" panel with before/after `<pre>` panes when content fields are present
  - `RoundtripReport.vue`: shows collapsed "Workflow content" panel with "Original" / "Re-imported" tabs when content fields are present
  - `ValidationReport.vue`: shows collapsed "Pre-validation clean" panel (renders `CleanReport`) when `clean_report` is present

- [#35](https://github.com/jmchilton/galaxy-tool-util-ts/pull/35) [`e54a513`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e54a51342e3930b61bae3b27ce46925f186cc93c) Thanks [@jmchilton](https://github.com/jmchilton)! - Add Nunjucks-based Markdown report rendering for all tree CLI commands. Syncs 8 Jinja2 `.md.j2` templates from Python Galaxy branch and renders them via Nunjucks. Adds `--report-markdown [file]` and `--report-html [file]` flags to `validate-tree`, `lint-tree`, `clean-tree`, and `roundtrip-tree`. Adds missing `RoundTripTreeReport`, `ExportTreeReport`, `ToNativeTreeReport` types and builders to `@galaxy-tool-util/schema`.

- [#29](https://github.com/jmchilton/galaxy-tool-util-ts/pull/29) [`16652a9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/16652a94c21402a3ee9108a0cd118d8af18c4708) Thanks [@jmchilton](https://github.com/jmchilton)! - Add structured report models for workflow lint/validate/roundtrip results, matching Python's `_report_models.py`. Includes category grouping in tree reports and structured encoding/structure error types.

- [#28](https://github.com/jmchilton/galaxy-tool-util-ts/pull/28) [`b3b1b52`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b3b1b52d9bccd6fdd7e713281be076ecfd74ee34) Thanks [@jmchilton](https://github.com/jmchilton)! - Decompose --strict into --strict-structure, --strict-encoding, --strict-state

  Add three granular strict validation flags to all gxwf commands (validate, lint, convert, roundtrip + tree variants). --strict remains as shorthand for all three.
  - --strict-structure: reject unknown keys via Effect Schema onExcessProperty: "error"
  - --strict-encoding: reject JSON-string tool_state (native) and tool_state field misuse (format2)
  - --strict-state: promote skipped/unconverted steps to failures (exit 2)

  Schema package: new strict-checks.ts with checkStrictEncoding/checkStrictStructure, RoundtripResult gains encodingErrors/structureErrors with multi-stage validation, StepValidationResult gains skippedReason.

- [#59](https://github.com/jmchilton/galaxy-tool-util-ts/pull/59) [`e5352d1`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e5352d1dee68d0396ccc5227ec931d83a95793d2) Thanks [@jmchilton](https://github.com/jmchilton)! - Add workflow-test file validation (`*-tests.yml` / `*.gxwf-tests.yml`).
  - New JSON Schema vendored from Galaxy's `galaxy.tool_util_models.Tests` Pydantic model (single source of truth), refreshed via `make sync-test-format-schema` against a Galaxy checkout.
  - `@galaxy-tool-util/schema` exports `validateTestsFile(parsed)` and `testsSchema`; validation is backed by Ajv (draft 2020-12).
  - `gxwf validate-tests <file>` and `gxwf validate-tests-tree <dir>` commands validate parsed tests documents and print diagnostics (or `--json` report).
  - Canonical positive/negative fixtures live in `packages/schema/test/fixtures/test-format/` and are reusable by downstream consumers (VS Code plugin tests, Galaxy-side Python interop).
  - `make verify-test-format-schema` checksums the vendored schema against `tests.schema.json.sha256` (written by `make sync-test-format-schema`) so CI catches hand-edits and missed resyncs; wired into `make check`.
  - Reusable by the galaxy-workflows-vscode plugin: the vendored `tests.schema.json` replaces the plugin's stale hand-written schema.
  - Cross-check: when paired with a workflow, emits workflow-aware diagnostics (`workflow_input_undefined`, `workflow_input_required`, `workflow_input_type`, `workflow_output_undefined`).
    - New exports from `@galaxy-tool-util/schema`: `WorkflowInput` / `WorkflowOutput` DTOs, `extractWorkflowInputs` / `extractWorkflowOutputs` (format-aware via existing `resolveFormat`), format-specific `extractFormat2*` / `extractNative*`, `isCompatibleType` + `jsTypeOf`, `checkTestsAgainstWorkflow`. Canonical DTOs the VS Code plugin can vendor — plugin keeps AST-range mapping only.
    - CLI: `gxwf validate-tests --workflow <path>` cross-checks a single tests file against a workflow. `gxwf validate-tests-tree --auto-workflow` pairs each tests file with a sibling workflow by filename convention (`foo.gxwf-tests.yml` ↔ `foo.gxwf.yml`/`foo.ga`, `bar-tests.yml` ↔ `bar.yml`/`bar.ga`); silent no-op when no sibling is found.

### Patch Changes

- [#42](https://github.com/jmchilton/galaxy-tool-util-ts/pull/42) [`005adf3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/005adf3c61b088904f9b665985bba51b5eabf04e) Thanks [@jmchilton](https://github.com/jmchilton)! - Extend `cleanWorkflow()` with structural cleaning and tool-aware stale key removal.
  - `cleanWorkflow()` now strips Galaxy-injected `uuid` and `errors` from both native and format2 workflow/step dicts (not `position`, which is a legitimate workflow property)
  - Format2 workflows now return per-step `CleanStepResult[]` instead of an empty array
  - New optional `toolInputsResolver` option: when provided, drops keys not in the tool's parameter tree via `stripStaleKeysToolAware` (native) or `walkFormat2State` (format2) — steps whose tool is not found in the resolver are skipped gracefully
  - `cleanWorkflow()` signature is now `async` (returns `Promise<CleanWorkflowResult>`) — **breaking change** for callers that used the result synchronously
  - New export: `CleanWorkflowOptions`

- [#49](https://github.com/jmchilton/galaxy-tool-util-ts/pull/49) [`d0c9888`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d0c9888891e236e233c271c8788c9055ae69506b) Thanks [@jmchilton](https://github.com/jmchilton)! - Flip workflow operations to write-by-default and add export/convert.
  - All 6 `/workflows/{path}/{op}` endpoints now require POST (was GET).
  - `clean` writes cleaned content back to disk by default; pass `dry_run=true` to preview without writing.
  - New `export` endpoint writes the converted workflow alongside the original (`.ga` ↔ `.gxwf.yml`).
  - New `convert` endpoint writes the converted workflow and removes the original.
  - Removed `to-format2` and `to-native` endpoints (absorbed into `export`/`convert`).
  - Non-dry-run clean/export/convert auto-refresh the workflow index.
  - Fix pipe truncation in `gxwf-web --output-schema` for specs larger than the OS pipe buffer.

  Schema: promote `serializeWorkflow` and `resolveFormat` from `@galaxy-tool-util/cli` into `@galaxy-tool-util/schema` so the CLI and the web server share one format-aware serializer. New `SerializeWorkflowOptions` adds `indent` (default 2) and `trailingNewline` (default true). YAML output now uses `lineWidth: 0` consistently. CLI re-exports the helpers for backwards compatibility.

- Updated dependencies [[`ac820d3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ac820d3d0b9f8ca798fd04d55aa18f61a7f970c9), [`005adf3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/005adf3c61b088904f9b665985bba51b5eabf04e), [`32fc546`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/32fc54687b7d674751b425768b424ba4c04a25f3), [`1af1f7d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/1af1f7dc3a84297c3d81bcf195781e7c010a6a0e), [`d0c9888`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d0c9888891e236e233c271c8788c9055ae69506b), [`54fc8f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54fc8f20720030cdbf690fd6e72066d7958fc9b5), [`a57f021`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/a57f021dbdbe6117a28add2b2e2f7520f09b068c), [`e54a513`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e54a51342e3930b61bae3b27ce46925f186cc93c), [`8f8c0e1`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8f8c0e1f79d2da3b3db59a5136156a0878cfefe4), [`16652a9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/16652a94c21402a3ee9108a0cd118d8af18c4708), [`b3b1b52`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b3b1b52d9bccd6fdd7e713281be076ecfd74ee34), [`e5352d1`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e5352d1dee68d0396ccc5227ec931d83a95793d2), [`85194f8`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/85194f8e710bc586939bc31b0cf20fc2d1329680), [`20f6943`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/20f694303d2f6b71dcb4689d79107306de5bf5aa), [`7786c6f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7786c6f3a250dba31ba27be9ca0b4431bc0b0065), [`fe80b5f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/fe80b5fe44c7f67a51fc9b8483e182edb6038c04)]:
  - @galaxy-tool-util/core@0.3.0
  - @galaxy-tool-util/schema@0.3.0

## 0.2.0

### Minor Changes

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `gxwf` CLI with validate, clean, lint, and convert subcommands plus tree (batch) variants for processing entire workflow directories. Single unified binary replaces prior tool-specific commands. Tree commands share a single tool cache load across all discovered workflows and produce aggregated summary reporting.

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add stateful workflow conversion between native and format2 with tool-aware parameter coercion (booleans, numbers, arrays). Includes pre-conversion eligibility checks, subworkflow recursion, per-step status reporting, and schema-aware roundtrip validation that classifies benign artifacts (type coercion, stale keys) vs real differences.

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `populate-workflow` and `structural-schema` commands to `galaxy-tool-cache` CLI. Add async external reference resolution for workflow imports supporting URL, base64, TRS, Galaxy @import, and file path strategies with cycle detection and depth limiting.

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Expand workflow validation with connection-aware state checking, legacy replacement parameter scanning, best-practices linting (annotations, creator, license, step labels), and format-specific validation paths. Add recursive tool state cleaning: stale key stripping, legacy JSON-encoded state decoding, and tool-aware pre-cleaning that respects declared parameter trees.

### Patch Changes

- Updated dependencies [[`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4), [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4), [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4), [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4), [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4)]:
  - @galaxy-tool-util/schema@0.2.0
  - @galaxy-tool-util/core@0.2.0
