---
"@galaxy-tool-util/schema": minor
---

Add `extractConcreteSubset(workflow): ExtractResult` to the draft-checks module — trims a draft Galaxy workflow down to the subset that could plausibly run.

Algorithm (per locked B-plan):

- Round 0 drops every step carrying any TODO sentinel or `_plan_*` field.
- Cascade rounds iteratively drop any step whose `in:` becomes dead (all source refs point at dropped steps / now-missing inner-subworkflow ports, with no `default:` fallback).
- Multi-source step inputs (`source: [a/p, b/p]`) where some refs survive are rewritten in place to the surviving ref subset (string carrier collapses to a single ref, list carrier preserves list shape).
- `default:`-only fallback: an input with both `source:` and `default:` whose source dies loses the `source:` key but keeps the entry — no cascade.
- Workflow outputs whose `outputSource` references a dropped step / dead port are dropped, reported in `dropped_outputs` with a `path` field — top-level outputs have `path: []`, inner subworkflow output drops are surfaced with the outer step path.
- Recurses into inline draft subworkflows (`run:` with `class: GalaxyWorkflowDraft`); inner shrinks in place. String-form `run:` (URL / `@import` / TRS) and concrete (`class: GalaxyWorkflow`) `run:` are opaque — no descent.
- Outer subworkflow steps are never shrunk in v1 — only inner workflows shrink in place. If an outer step's `in:` cascades, it drops whole.
- Workflow `inputs:` are preserved verbatim — orphan-input pruning is a separate lint concern.
- Top-level `_plan_*` fields on the workflow root pass through unchanged.
- Returned `workflow.class` is always `GalaxyWorkflowDraft` even after a clean extract; promotion to concrete + `_plan_*` strip live in the upcoming `clean.ts` `stripPlanFields` option (CLI command E).

Determinism: per workflow level, `dropped_steps` is sorted by cascade round (0 → N) then alphabetical step-path; across levels, a level's drops come first followed by per surviving subworkflow's drops in source iteration order. `dropped_outputs` is alphabetical by label within a level. Surviving steps / inputs / outputs preserve their original input iteration order. Pure + byte-for-byte idempotent.

**Notes on intentional deviations from the original B-plan:**

- The plan defined a `DropReason` variant `subworkflow_not_concrete`; not emitted in this implementation. An outer subworkflow step whose inner workflow degrades is signalled via the standard `cascade` reason on the outer step (when its `in:` cascades) and via inner drops surfaced under the outer step's path. Adding a dedicated reason was not necessary to express that.
- Plan test-step 9 (cross-decoding the extract output against the concrete `GalaxyWorkflowSchema`) is intentionally deferred to E (CLI `_draft-extract` command). The result of `extractConcreteSubset` always carries `class: GalaxyWorkflowDraft`, so a concrete-schema decode would fail by design without an intervening `clean.ts stripPlanFields: true` + class flip. E owns that conversion and is the right place for the structural cross-check.
