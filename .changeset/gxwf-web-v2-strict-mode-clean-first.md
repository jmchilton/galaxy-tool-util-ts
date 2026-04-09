---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
"@galaxy-tool-util/gxwf-web": minor
"@galaxy-tool-util/gxwf-report-shell": minor
---

Expose fine-grained strict options, clean-first validation, JSON-schema mode, and before/after workflow content in the gxwf-web server and report UI.

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
