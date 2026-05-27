---
"@galaxy-tool-util/cli": minor
"@galaxy-tool-util/schema": patch
---

Add `gxwf draft-validate <file>` — single-file validation of draft Galaxy workflows (`class: GalaxyWorkflowDraft`). Wraps `validateDraft` from `@galaxy-tool-util/schema`; emits a human-readable text summary by default, with `--json` (full `SingleDraftValidationReport`), `--report-html` (self-contained gxwf-report-shell page), and `--report-markdown` (new `draft_validate.md.j2` template) modes. Exit codes: `0` clean (warnings allowed), `1` topology/semantic errors, `2` parse failure / class mismatch / structural decode failure / `--format native` on a draft. Tree variant (`draft-validate-tree`) and connection validation against concrete tool ids are deferred to v2.

Schema patch: re-export `buildSingleDraftValidationReport` and the `DraftValidationDiagnosticReport` / `DraftSurveyReport` / `SingleDraftValidationReport` types from the package root index so CLI callers don't have to reach into the `workflow/` subpath.
