---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

Add workflow-test file validation (`*-tests.yml` / `*.gxwf-tests.yml`).

- New JSON Schema vendored from Galaxy's `galaxy.tool_util_models.Tests` Pydantic model (single source of truth), refreshed via `make sync-test-format-schema` against a Galaxy checkout.
- `@galaxy-tool-util/schema` exports `validateTestsFile(parsed)` and `testsSchema`; validation is backed by Ajv (draft 2020-12).
- `gxwf validate-tests <file>` and `gxwf validate-tests-tree <dir>` commands validate parsed tests documents and print diagnostics (or `--json` report).
- Canonical positive/negative fixtures live in `packages/schema/test/fixtures/test-format/` and are reusable by downstream consumers (VS Code plugin tests, Galaxy-side Python interop).
- `make verify-test-format-schema` checksums the vendored schema against `tests.schema.json.sha256` (written by `make sync-test-format-schema`) so CI catches hand-edits and missed resyncs; wired into `make check`.
- Reusable by the galaxy-workflows-vscode plugin: the vendored `tests.schema.json` replaces the plugin's stale hand-written schema.
- Cross-check: when paired with a workflow, emits workflow-aware diagnostics (`workflow_input_undefined`, `workflow_input_required`, `workflow_input_type`, `workflow_output_undefined`).
  - New exports from `@galaxy-tool-util/schema`: `WorkflowInput` / `WorkflowOutput` DTOs, `extractWorkflowInputs` / `extractWorkflowOutputs` (format-aware via existing `resolveFormat`), format-specific `extractFormat2*` / `extractNative*`, `isCompatibleType` + `jsTypeOf`, `checkTestsAgainstWorkflow`. Canonical DTOs the VS Code plugin can vendor — plugin keeps AST-range mapping only.
  - CLI: `gxwf validate-tests --workflow <path>` cross-checks a single tests file against a workflow. `gxwf validate-tests-tree --auto-workflow` pairs each tests file with a sibling workflow by filename convention (`foo.gxwf-tests.yml` ↔ `foo.gxwf.yml`/`foo.ga`, `bar-tests.yml` ↔ `bar.yml`/`bar.ga`); silent no-op when no sibling is found.
