---
"@galaxy-tool-util/schema": patch
---

Fix-ups to `draft-checks.ts` from an independent review pass:

- `detectDraft` now reads TODO sentinels from list-form step `in:` entries (`in: [{ id: "TODO_x", source: "..." }]`), matching the long-supported list-form coverage in `validateDraft`. Previously dict-form was the only path that hit the sentinel walker.
- `validateDraft` now emits the "top-level `_plan_*`" warning at every draft root (outer document + every nested draft subworkflow root), not just the outermost. Inner-draft `_plan_*` was previously silent.
- `TODO_LIKE` heuristic anchored to `/^TODO([_-]|$)/` (was `/^TODO/`), so identifiers like `TODONE`, `TODOLIST` no longer false-positive as "malformed sentinels."
- Added a documentation comment clarifying the intentional asymmetry between `detectDraft` (step-focused survey; ignores top-level `_plan_*`) and `validateDraft` (rules-focused walker; warns).
- Added documentation comment on inner-draft outputs path convention (path = outer step's path, mirrors how subworkflow steps reach their inner workflow).

7 new tests covering each fix-up + an input-ordering idempotence test for `nextDraftStep`.
