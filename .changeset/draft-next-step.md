---
"@galaxy-tool-util/schema": minor
---

Add `nextDraftStep(workflow): NextStepResult` — pure, idempotent function that returns the next step a downstream agent should work on. Walks steps in topological order with alphabetical tie-break; first step carrying any TODO sentinel or `_plan_*` field returns with a prompt-shaped `work[]` array in the locked-decision order (tool_id → tool_version → in.* → out.* → _plan_state → _plan_context → _plan_in → _plan_out).

Work items embed semantic hints stripped from `TODO_<hint>` port names and, for `out:` ports, the workflow-output labels that reference them (helps the next agent pick the right wrapper port). Subworkflow-aware: descends into draft `run:` blocks only after the outer step is itself fully concrete.

Returns `{ draft: false }` when there's nothing left to do (including non-draft documents).
