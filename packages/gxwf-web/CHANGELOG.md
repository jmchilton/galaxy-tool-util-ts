# @galaxy-tool-util/gxwf-web

## 1.1.0

### Minor Changes

- [#68](https://github.com/jmchilton/galaxy-tool-util-ts/pull/68) [`3b97a0f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3b97a0f41c2358aa663df4e6490488e89c9ba9e5) Thanks [@jmchilton](https://github.com/jmchilton)! - UI polish: auto-preview for clean/export/convert with explicit apply buttons (no more dry-run toggle). Lint report now surfaces error/warning messages alongside counts via new `lint_error_messages` / `lint_warning_messages` fields on `SingleLintReport`.

### Patch Changes

- Updated dependencies [[`3b97a0f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3b97a0f41c2358aa663df4e6490488e89c9ba9e5), [`54a9f93`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54a9f939ee25195b804cb7b2ed1e598cad97b5ca), [`944d671`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/944d6719028566e0a3231bc76cb603ed9fd03346), [`25104d3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/25104d395f17ed6e84cc7a214fb193349e5141f8)]:
  - @galaxy-tool-util/schema@1.1.0
  - @galaxy-tool-util/cli@1.1.0
  - @galaxy-tool-util/core@1.1.0

## 1.0.0

### Patch Changes

- Updated dependencies [[`afcd804`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/afcd804e03dacffd03821c3f75e2cae4a0340400), [`7b835d2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7b835d298c4863ac0573e9091f4b1b8c72c34fef), [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941), [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941), [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941)]:
  - @galaxy-tool-util/schema@1.0.0
  - @galaxy-tool-util/cli@1.0.0
  - @galaxy-tool-util/core@1.0.0

## 0.4.0

### Patch Changes

- Updated dependencies [[`8404313`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8404313159eb3950fefbb4c6c2ad2c7ddc79eef5), [`f4ea125`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/f4ea12548ffe1a69f33970cd8de18b76cbe2e744)]:
  - @galaxy-tool-util/schema@0.4.0
  - @galaxy-tool-util/cli@0.4.0

## 0.3.0

### Minor Changes

- [#57](https://github.com/jmchilton/galaxy-tool-util-ts/pull/57) [`b5a6e57`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b5a6e57b26aa926ca5bf18b36f63d80bad9e90df) Thanks [@jmchilton](https://github.com/jmchilton)! - Emit Monaco-compatible `Content-Security-Policy` header on static responses (Phase 4.5 of VS Code integration plan). Adds `--csp-connect-src <origin>` CLI flag (repeatable) and `extraConnectSrc` option on `createApp` to extend `connect-src` with per-deployment tool-cache proxies or ToolShed mirrors.

- [#41](https://github.com/jmchilton/galaxy-tool-util-ts/pull/41) [`4fcaa2b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/4fcaa2b957aed4943b9ca527d6ebd6c0c88e989a) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `GXWF_BACKEND_URL` and `GXWF_UI_DIST` env var support. `GXWF_BACKEND_URL` overrides the Vite dev proxy target (default `http://localhost:8000`). `GXWF_UI_DIST` overrides the bundled `public/` UI directory at runtime.

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

- [#57](https://github.com/jmchilton/galaxy-tool-util-ts/pull/57) [`b5a6e57`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b5a6e57b26aa926ca5bf18b36f63d80bad9e90df) Thanks [@jmchilton](https://github.com/jmchilton)! - CSP: drop `https://open-vsx.org`, `blob:`, and `data:` from `connect-src`. The Monaco extension is now served as an unpacked directory under `/ext/galaxy-workflows/` via plain HTTP; the browser no longer fetches Open VSX or constructs blob/data URLs for extension files. Production deployments are expected to unpack the extension server-side at startup into the same layout.

- [#43](https://github.com/jmchilton/galaxy-tool-util-ts/pull/43) [`6c406cb`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/6c406cb30215ab61fdb5b8d1661727f188bcf7cd) Thanks [@jmchilton](https://github.com/jmchilton)! - Validate `GXWF_UI_DIST` path on startup; exit with error if directory does not exist.

- [#57](https://github.com/jmchilton/galaxy-tool-util-ts/pull/57) [`b5a6e57`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b5a6e57b26aa926ca5bf18b36f63d80bad9e90df) Thanks [@jmchilton](https://github.com/jmchilton)! - Unblock Monaco editor boot against the vsix fixture:
  - `gxwf-web`: add a Monaco-specific CSP header for `/monaco/*` (extension host iframe + workers need `unsafe-inline`/`unsafe-eval`); add `blob:`/`data:` to the main CSP's `connect-src` so the vsix loader can fetch packaged extension files.
  - `gxwf-ui`: switch the in-memory file provider from `registerCustomProvider` (pre-init only in monaco-vscode-api 30.x) to `registerFileSystemOverlay`, fixing the "Services are already initialized" crash on editor mount; patch the staged extension-host iframe's meta CSP to allow `blob:` fetches; honor the `:path` route param in `FileView` so deep links land on the selected file.

- Updated dependencies [[`ac820d3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ac820d3d0b9f8ca798fd04d55aa18f61a7f970c9), [`005adf3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/005adf3c61b088904f9b665985bba51b5eabf04e), [`32fc546`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/32fc54687b7d674751b425768b424ba4c04a25f3), [`3826da3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3826da31ccfc8c24ec9ebee85306e4b8fffb15dd), [`1af1f7d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/1af1f7dc3a84297c3d81bcf195781e7c010a6a0e), [`d0c9888`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d0c9888891e236e233c271c8788c9055ae69506b), [`54fc8f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54fc8f20720030cdbf690fd6e72066d7958fc9b5), [`a57f021`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/a57f021dbdbe6117a28add2b2e2f7520f09b068c), [`e54a513`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e54a51342e3930b61bae3b27ce46925f186cc93c), [`8f8c0e1`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8f8c0e1f79d2da3b3db59a5136156a0878cfefe4), [`16652a9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/16652a94c21402a3ee9108a0cd118d8af18c4708), [`b3b1b52`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b3b1b52d9bccd6fdd7e713281be076ecfd74ee34), [`e5352d1`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e5352d1dee68d0396ccc5227ec931d83a95793d2), [`85194f8`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/85194f8e710bc586939bc31b0cf20fc2d1329680), [`20f6943`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/20f694303d2f6b71dcb4689d79107306de5bf5aa), [`7786c6f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7786c6f3a250dba31ba27be9ca0b4431bc0b0065), [`fe80b5f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/fe80b5fe44c7f67a51fc9b8483e182edb6038c04)]:
  - @galaxy-tool-util/core@0.3.0
  - @galaxy-tool-util/schema@0.3.0
  - @galaxy-tool-util/cli@0.3.0
