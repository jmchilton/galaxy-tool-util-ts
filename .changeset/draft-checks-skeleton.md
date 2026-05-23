---
"@galaxy-tool-util/schema": minor
---

Add `draft-checks.ts` module — pure logic for Galaxy draft workflows (`class: GalaxyWorkflowDraft`). Exports `TODO_SENTINEL_PATTERN`, `PLAN_FIELDS`, `DRAFT_CLASS` constants plus `isTodoSentinel`, `isDraftWorkflow`, and `detectDraft(workflow): DraftSurvey` for collecting every TODO sentinel and `_plan_*` field with its step path. Subworkflow-aware: recurses into `run:` blocks only when the inner workflow is itself a draft. No CLI surface yet — substrate for forthcoming `gxwf draft-*` commands.

Sentinel constants are kept in sync with upstream `gxformat2/draft.py` via a new `make check-sync-draft-sentinel` target wired into `make check`; `sync-schema-sources` snapshots the upstream constants to `schema-sources/v19_09/draft_constants.json` when a draft-aware gxformat2 checkout is available.
