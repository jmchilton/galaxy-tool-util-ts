---
"@galaxy-tool-util/schema": minor
---

Add `SingleDraftValidationReport` + `buildSingleDraftValidationReport` to `workflow/report-models.ts`. Wraps `DraftValidationResult` (from the draft-checks module) in the snake_case, frontend-compatible report shape the upcoming `gxwf draft-validate` CLI command emits via `--json`. Includes a `DraftSurveyReport` summary deduped to one entry per step path (TODO paths + plan-field paths), a `summary` string ("draft valid" / "draft valid (N warnings)" / "M errors[, N warnings]"), and faithful pass-through of structure / topology / semantic / warning diagnostics.

Substrate for workstream C; no CLI surface yet.
