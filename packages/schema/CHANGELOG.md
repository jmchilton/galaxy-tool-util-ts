# @galaxy-tool-util/schema

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

### Patch Changes

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`016385b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/016385bb0e40a9cbe1f6c55d9d18829917914df0) Thanks [@jmchilton](https://github.com/jmchilton)! - Fix mermaid + cytoscape diagram step labels for unlabeled native (`.ga`)
  steps. The native→format2 normalizer assigns synthetic ids of the form
  `_unlabeled_step_<n>` to steps without a label, which the diagram builders
  were rendering verbatim instead of falling through to the `tool:<tool_id>`
  display fallback. `workflowToMermaid` and `cytoscapeElements` now skip
  unlabeled-prefix step ids when computing the visible label, matching the
  documented `label || id || tool:tool_id || index` chain.

- [#89](https://github.com/jmchilton/galaxy-tool-util-ts/pull/89) [`ee543b5`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ee543b522c9181f0920969746e271e986fea3249) Thanks [@jmchilton](https://github.com/jmchilton)! - Type ParsedTool outputs against current Galaxy output models.

## 1.1.0

### Minor Changes

- [#68](https://github.com/jmchilton/galaxy-tool-util-ts/pull/68) [`3b97a0f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3b97a0f41c2358aa663df4e6490488e89c9ba9e5) Thanks [@jmchilton](https://github.com/jmchilton)! - UI polish: auto-preview for clean/export/convert with explicit apply buttons (no more dry-run toggle). Lint report now surfaces error/warning messages alongside counts via new `lint_error_messages` / `lint_warning_messages` fields on `SingleLintReport`.

### Patch Changes

- [#75](https://github.com/jmchilton/galaxy-tool-util-ts/pull/75) [`11a6625`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/11a66254a6c1c2640954ab4fbc41c59b0add0617) Thanks [@jmchilton](https://github.com/jmchilton)! - Re-sync vendored `tests.schema.json` from Galaxy `wf_tool_state` branch.

  Picks up upstream enrichment of `galaxy.tool_util_models.Tests`: new `Job`
  def, named `assertion_list` ref replacing the auto-generated discriminator
  blob, and added `title` fields on collection/file properties.

## 1.0.0

### Minor Changes

- [#63](https://github.com/jmchilton/galaxy-tool-util-ts/pull/63) [`afcd804`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/afcd804e03dacffd03821c3f75e2cae4a0340400) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `expandToolStateDefaults(toolInputs, currentState)` — port of Galaxy's `fill_static_defaults`. Fills scalar defaults for absent keys, recurses into conditionals (honoring user's active `test_value`), pads repeats to `min`, creates+fills absent sections. Does not validate; does not pre-seed data / data_collection (non-optional) / baseurl / color / directory_uri / group_tag / rules / data_column inputs. Walker gains a `repeatMinPad` option to support the expand-defaults repeat semantics.

- [#66](https://github.com/jmchilton/galaxy-tool-util-ts/pull/66) [`7b835d2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7b835d298c4863ac0573e9091f4b1b8c72c34fef) Thanks [@jmchilton](https://github.com/jmchilton)! - Port `workflow_to_mermaid` from gxformat2 and expose as `gxwf mermaid`.
  - `@galaxy-tool-util/schema`: new `workflowToMermaid(workflow, { comments? })` that renders a Mermaid flowchart string from any Format2 / native workflow input. Shapes inputs by type, strips the main toolshed prefix from tool IDs, deduplicates edges, and optionally renders frame comments as `subgraph` blocks.
  - `@galaxy-tool-util/cli`: new `gxwf mermaid <file> [output] [--comments]` command. Writes raw `.mmd` by default; `.md` output path wraps the diagram in a fenced `mermaid` code block; stdout if no output path.
  - Behavioral coverage driven by the declarative YAML suite synced from gxformat2 (`mermaid.yml` via `make sync-workflow-expectations`). Adds `value_matches` assertion mode to the shared declarative test harness.

- [#63](https://github.com/jmchilton/galaxy-tool-util-ts/pull/63) [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941) Thanks [@jmchilton](https://github.com/jmchilton)! - `ParsedTool` Effect Schema (plus `HelpContent`, `XrefDict`, `Citation`) now lives in `@galaxy-tool-util/schema` — it was moved from `@galaxy-tool-util/core`. This aligns package ownership: `schema` owns data models (parameter types, `ParsedTool`, workflow formats); `core` owns IO (`ToolInfoService`, `ToolCache`, HTTP clients).

  `ParsedTool.inputs` is now typed as `readonly ToolParameterModel[]` instead of `readonly unknown[]`. Runtime decode behavior is unchanged (the underlying Effect Schema is a permissive object-guard; trusted-peer payloads are still accepted) — downstream consumers get compile-time typing without having to cast.

  `ToolStateValidator` now accepts any `ToolInfoLookup` (`{ getToolInfo(toolId, toolVersion?) }`) instead of a concrete `ToolInfoService`. The `ToolInfoService` class in `@galaxy-tool-util/core` satisfies this interface structurally; no caller change required. This inverts the latent dependency — schema no longer needs a `@galaxy-tool-util/core` type import.

  Additional leaf parameter-model types are now exported from the public index: `IntegerParameterModel`, `FloatParameterModel`, `TextParameterModel`.

- [#63](https://github.com/jmchilton/galaxy-tool-util-ts/pull/63) [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `buildMinimalToolState(tool)` and step-skeleton builders (`buildNativeStep`, `buildFormat2Step`, `buildStep`) for inserting a freshly authored tool step into a workflow. `buildMinimalToolState` today always returns `{}` — the existing decoders/validators already handle absent keys via default conditional branches and parameter defaults — and is the designated extension point if that ever changes. Step-skeleton builders seed `tool_state` / `state` via `buildMinimalToolState` rather than hardcoding `{}`, so a single patch shifts the semantics without a codebase sweep. Native skeletons emit the object form of `tool_state` (not the double-encoded JSON string form) — matches what the VS Code clean pipeline expects. Skeletons are tested against both the raw Effect schema and the higher-level `validateNativeStepState` / `validateFormat2StepState` — any diagnostics emitted reference only the data / data_collection inputs the user is expected to wire after insertion.

## 0.4.0

### Minor Changes

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

## 0.3.0

### Minor Changes

- [#42](https://github.com/jmchilton/galaxy-tool-util-ts/pull/42) [`005adf3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/005adf3c61b088904f9b665985bba51b5eabf04e) Thanks [@jmchilton](https://github.com/jmchilton)! - Extend `cleanWorkflow()` with structural cleaning and tool-aware stale key removal.
  - `cleanWorkflow()` now strips Galaxy-injected `uuid` and `errors` from both native and format2 workflow/step dicts (not `position`, which is a legitimate workflow property)
  - Format2 workflows now return per-step `CleanStepResult[]` instead of an empty array
  - New optional `toolInputsResolver` option: when provided, drops keys not in the tool's parameter tree via `stripStaleKeysToolAware` (native) or `walkFormat2State` (format2) — steps whose tool is not found in the resolver are skipped gracefully
  - `cleanWorkflow()` signature is now `async` (returns `Promise<CleanWorkflowResult>`) — **breaking change** for callers that used the result synchronously
  - New export: `CleanWorkflowOptions`

- [#49](https://github.com/jmchilton/galaxy-tool-util-ts/pull/49) [`1af1f7d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/1af1f7dc3a84297c3d81bcf195781e7c010a6a0e) Thanks [@jmchilton](https://github.com/jmchilton)! - Mutating workflow ops + export/convert UI. Schema adds `ExportResult` / `ConvertResult` / `WorkflowSourceFormat`. Report shell adds `ExportReport.vue` and routes `"export"`/`"convert"` report types. UI switches workflow ops to POST, adds dry_run toggle on Clean, Export and Convert tabs with destructive-op confirmation and post-mutation workflow list refresh; Convert navigates back to the dashboard after removing the source. gxwf-client tests exercise POST export/convert and dry_run semantics.

- [#49](https://github.com/jmchilton/galaxy-tool-util-ts/pull/49) [`d0c9888`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d0c9888891e236e233c271c8788c9055ae69506b) Thanks [@jmchilton](https://github.com/jmchilton)! - Flip workflow operations to write-by-default and add export/convert.
  - All 6 `/workflows/{path}/{op}` endpoints now require POST (was GET).
  - `clean` writes cleaned content back to disk by default; pass `dry_run=true` to preview without writing.
  - New `export` endpoint writes the converted workflow alongside the original (`.ga` ↔ `.gxwf.yml`).
  - New `convert` endpoint writes the converted workflow and removes the original.
  - Removed `to-format2` and `to-native` endpoints (absorbed into `export`/`convert`).
  - Non-dry-run clean/export/convert auto-refresh the workflow index.
  - Fix pipe truncation in `gxwf-web --output-schema` for specs larger than the OS pipe buffer.

  Schema: promote `serializeWorkflow` and `resolveFormat` from `@galaxy-tool-util/cli` into `@galaxy-tool-util/schema` so the CLI and the web server share one format-aware serializer. New `SerializeWorkflowOptions` adds `indent` (default 2) and `trailingNewline` (default true). YAML output now uses `lineWidth: 0` consistently. CLI re-exports the helpers for backwards compatibility.

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

- [#34](https://github.com/jmchilton/galaxy-tool-util-ts/pull/34) [`85194f8`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/85194f8e710bc586939bc31b0cf20fc2d1329680) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `ToolStateValidator` class — high-level bridge for validating tool_state in workflow steps without exposing Effect internals. Supports both native and format2 step validation, returning `ToolStateDiagnostic[]`.

- [#36](https://github.com/jmchilton/galaxy-tool-util-ts/pull/36) [`20f6943`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/20f694303d2f6b71dcb4689d79107306de5bf5aa) Thanks [@jmchilton](https://github.com/jmchilton)! - Abstractions to ease VS Code integration: export `ToolParameterModel` types + type guards from public index, add `findParamAtPath` + `validateFormat2StepStrict` helpers, consolidate `ToolStateDiagnostic` definition in `stateful-validate` (re-exported from `tool-state-validator`).

### Patch Changes

- [#46](https://github.com/jmchilton/galaxy-tool-util-ts/pull/46) [`a57f021`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/a57f021dbdbe6117a28add2b2e2f7520f09b068c) Thanks [@jmchilton](https://github.com/jmchilton)! - Normalize step position to left/top only in cleanWorkflow, porting Python's \_strip_position_extras. Adds normalizeStepPosition called via cleanNativeSteps for all steps including data_input inside subworkflows.

- [#47](https://github.com/jmchilton/galaxy-tool-util-ts/pull/47) [`8f8c0e1`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8f8c0e1f79d2da3b3db59a5136156a0878cfefe4) Thanks [@jmchilton](https://github.com/jmchilton)! - Regenerate workflow Effect Schemas with schema-salad-plus-pydantic 0.1.9

- [#19](https://github.com/jmchilton/galaxy-tool-util-ts/pull/19) [`7786c6f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7786c6f3a250dba31ba27be9ca0b4431bc0b0065) Thanks [@jmchilton](https://github.com/jmchilton)! - Unify walker: state-merge.ts inject/strip now delegate to walkNativeState, eliminating ~140 lines of duplicated parameter-tree traversal. Extract walk-helpers.ts for shared helper functions. No behavioral changes.

- [#60](https://github.com/jmchilton/galaxy-tool-util-ts/pull/60) [`fe80b5f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/fe80b5fe44c7f67a51fc9b8483e182edb6038c04) Thanks [@jmchilton](https://github.com/jmchilton)! - Add optional `type?: WorkflowDataType` to `WorkflowOutput`. Extractors leave it unset; downstream consumers (e.g. the VS Code plugin's AST extractor) populate it when the information is available.

## 0.2.0

### Minor Changes

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `gx_rules` parameter type support (RulesModel and RulesMapping), completing Galaxy parameter type coverage and eliminating all IWC sweep test gaps.

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `gxwf` CLI with validate, clean, lint, and convert subcommands plus tree (batch) variants for processing entire workflow directories. Single unified binary replaces prior tool-specific commands. Tree commands share a single tool cache load across all discovered workflows and produce aggregated summary reporting.

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add stateful workflow conversion between native and format2 with tool-aware parameter coercion (booleans, numbers, arrays). Includes pre-conversion eligibility checks, subworkflow recursion, per-step status reporting, and schema-aware roundtrip validation that classifies benign artifacts (type coercion, stale keys) vs real differences.

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `populate-workflow` and `structural-schema` commands to `galaxy-tool-cache` CLI. Add async external reference resolution for workflow imports supporting URL, base64, TRS, Galaxy @import, and file path strategies with cycle detection and depth limiting.

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Expand workflow validation with connection-aware state checking, legacy replacement parameter scanning, best-practices linting (annotations, creator, license, step labels), and format-specific validation paths. Add recursive tool state cleaning: stale key stripping, legacy JSON-encoded state decoding, and tool-aware pre-cleaning that respects declared parameter trees.
