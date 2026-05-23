---
"@galaxy-tool-util/schema": minor
---

Wire the new gxformat2 draft workflow schema (`class: GalaxyWorkflowDraft`) through `make sync` + `make generate-schemas`. Adds `gxformat2-draft.ts` / `gxformat2-draft.effect.ts` to `packages/schema/src/workflow/raw/` and re-exports `DraftWorkflowStep`, `GalaxyWorkflowDraft`, `DraftWorkflowStepSchema`, `GalaxyWorkflowDraftSchema` from the raw barrel. Draft steps carry the `_plan_state` / `_plan_context` / `_plan_in` / `_plan_out` optional string fields with their literal underscore-prefixed keys preserved by the Effect Schema generator. No runtime behavior change yet; downstream draft-checks logic will land in a follow-up.
