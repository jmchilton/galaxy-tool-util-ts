---
"@galaxy-tool-util/schema": minor
---

Add `validateDraft(workflow)` to the draft-checks module. Collects all diagnostics into a structured `DraftValidationResult { ok, structureErrors, topologyErrors, semanticErrors, warnings, survey }` — does not throw.

Checks:
- structural decode against `GalaxyWorkflowDraftSchema`
- concrete-topology: workflow input/output/step labels and step types cannot be TODO sentinels
- syntactic edge resolution: every `step/port` source ref must resolve to a declared step + declared port (TODO_* ports count if declared in the source step's `out:`)
- sentinel form: TODO-shaped strings that don't match `^TODO(_[a-z0-9_]+)?$` (e.g. `TODO-foo`, `TODOfoo`, `TODO_`) emit semantic errors
- warnings: bare `TODO` in port position (canonical form is `TODO_<hint>`), and top-level `_plan_*` fields (planning fields belong on individual steps)

Recurses into draft subworkflows (`run:` with `class: GalaxyWorkflowDraft`); diagnostic step paths are prefixed with the outer chain.
