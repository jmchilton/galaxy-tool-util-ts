# @galaxy-tool-util/gxwf-web

## 0.2.0

### Minor Changes

- [#41](https://github.com/jmchilton/galaxy-tool-util-ts/pull/41) [`4fcaa2b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/4fcaa2b957aed4943b9ca527d6ebd6c0c88e989a) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `GXWF_BACKEND_URL` and `GXWF_UI_DIST` env var support. `GXWF_BACKEND_URL` overrides the Vite dev proxy target (default `http://localhost:8000`). `GXWF_UI_DIST` overrides the bundled `public/` UI directory at runtime.

- [#30](https://github.com/jmchilton/galaxy-tool-util-ts/pull/30) [`c4df435`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/c4df4357af969557d5eab783f5baae11ee617ef1) Thanks [@jmchilton](https://github.com/jmchilton)! - Add @galaxy-tool-util/gxwf-web package — Phase 1 scaffold with full Jupyter Contents API. Includes HTTP server (Node http), contents CRUD, checkpoints, path safety (traversal + symlink), binary auto-detection, conflict detection via If-Unmodified-Since, 52 passing tests.

- [#30](https://github.com/jmchilton/galaxy-tool-util-ts/pull/30) [`0124aac`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0124aac556b94f575fddd86a91eaff923933fec1) Thanks [@jmchilton](https://github.com/jmchilton)! - Add workflow operations (validate, lint, clean, to-format2, to-native, roundtrip), OpenAPI client type generation, and query param parity with Python server. Exports typed `paths`/`components`/`operations` from vendored OpenAPI spec; `--output-schema` CLI flag outputs the spec. All validate/lint/clean params now accepted (allow/deny/preserve/strip are no-ops pending StaleKeyPolicy; strict/connections/mode wired). 67 tests.

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

### Patch Changes

- [#43](https://github.com/jmchilton/galaxy-tool-util-ts/pull/43) [`6c406cb`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/6c406cb30215ab61fdb5b8d1661727f188bcf7cd) Thanks [@jmchilton](https://github.com/jmchilton)! - Validate `GXWF_UI_DIST` path on startup; exit with error if directory does not exist.

- Updated dependencies [[`005adf3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/005adf3c61b088904f9b665985bba51b5eabf04e), [`3826da3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3826da31ccfc8c24ec9ebee85306e4b8fffb15dd), [`54fc8f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54fc8f20720030cdbf690fd6e72066d7958fc9b5), [`a57f021`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/a57f021dbdbe6117a28add2b2e2f7520f09b068c), [`e54a513`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e54a51342e3930b61bae3b27ce46925f186cc93c), [`16652a9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/16652a94c21402a3ee9108a0cd118d8af18c4708), [`b3b1b52`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b3b1b52d9bccd6fdd7e713281be076ecfd74ee34), [`85194f8`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/85194f8e710bc586939bc31b0cf20fc2d1329680), [`20f6943`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/20f694303d2f6b71dcb4689d79107306de5bf5aa), [`7786c6f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7786c6f3a250dba31ba27be9ca0b4431bc0b0065)]:
  - @galaxy-tool-util/schema@0.3.0
  - @galaxy-tool-util/cli@0.3.0
