# @galaxy-tool-util/cli

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

- Updated dependencies [[`ac820d3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ac820d3d0b9f8ca798fd04d55aa18f61a7f970c9), [`005adf3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/005adf3c61b088904f9b665985bba51b5eabf04e), [`32fc546`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/32fc54687b7d674751b425768b424ba4c04a25f3), [`1af1f7d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/1af1f7dc3a84297c3d81bcf195781e7c010a6a0e), [`d0c9888`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d0c9888891e236e233c271c8788c9055ae69506b), [`54fc8f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54fc8f20720030cdbf690fd6e72066d7958fc9b5), [`a57f021`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/a57f021dbdbe6117a28add2b2e2f7520f09b068c), [`e54a513`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e54a51342e3930b61bae3b27ce46925f186cc93c), [`8f8c0e1`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8f8c0e1f79d2da3b3db59a5136156a0878cfefe4), [`16652a9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/16652a94c21402a3ee9108a0cd118d8af18c4708), [`b3b1b52`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b3b1b52d9bccd6fdd7e713281be076ecfd74ee34), [`85194f8`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/85194f8e710bc586939bc31b0cf20fc2d1329680), [`20f6943`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/20f694303d2f6b71dcb4689d79107306de5bf5aa), [`7786c6f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7786c6f3a250dba31ba27be9ca0b4431bc0b0065)]:
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
