# @galaxy-tool-util/schema

## 1.9.0

### Minor Changes

- [#146](https://github.com/jmchilton/galaxy-tool-util-ts/pull/146) [`d0f0cac`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d0f0cac5235a10de6b7da822137dd48af1fb71c3) Thanks [@jmchilton](https://github.com/jmchilton)! - feat(cytoscape): render draft workflows with a planned/concrete visual distinction

  `cytoscapeElements` now accepts `GalaxyWorkflowDraft` documents first-class,
  the cytoscape sibling of the mermaid draft support. It consumes the shared
  `resolveDraftOverlay` / `DraftOverlay` / `PLANNED_CLASS` / `stepRenderIdentity`
  abstractions: planned nodes gain a `planned` class (appended after
  `type_*`/`runnable`) plus `data.planned` and structured `data.plan_reason`
  (`{ todos, plan_fields }`) for viewer tooltips; edges touching a planned step
  or a `TODO_*` port gain `planned`, coexisting with any `mapover_*`/`reduction`
  class. Concrete workflows render byte-for-byte as before. Detection is
  automatic — a draft "just works"; pass `draftOverlay: null` (CLI
  `gxwf cytoscapejs --no-draft-overlay`) to force plain output.

  New export: `CytoscapePlanReason`. The bundled HTML stylesheet is unchanged
  (it syncs from upstream gxformat2); the `planned` CSS treatment lands there
  once the upstream template gains it.

- [#146](https://github.com/jmchilton/galaxy-tool-util-ts/pull/146) [`df26076`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/df26076daa7c44ed223a98856b8d0eca04471901) Thanks [@jmchilton](https://github.com/jmchilton)! - feat(mermaid): render draft workflows with a planned/concrete visual distinction

  `workflowToMermaid` now accepts `GalaxyWorkflowDraft` documents first-class.
  A new pure `resolveDraftOverlay(raw)` classifies each step as planned (it
  carries a TODO sentinel or a `_plan_*` field) and the builder marks planned
  nodes with a dashed/muted `planned` class and dashes edges that touch a
  planned step or a `TODO_*` port. Concrete workflows render byte-for-byte as
  before. Detection is automatic — a draft "just works"; pass `draftOverlay:
null` (CLI `gxwf mermaid --no-draft-overlay`) to force plain output.

  New exports from `@galaxy-tool-util/schema`: `resolveDraftOverlay`,
  `DraftOverlay`, `DraftPlannedReason`, `PLANNED_CLASS`, and the shared
  `stepRenderIdentity` / `rawStepRenderIdentity` helpers (the single identity
  both the draft classifier and the visualizers key off, so overlay keys always
  match the builders' node lookups). The structured `plannedReason` is carried
  for the upcoming cytoscape consumer.

### Patch Changes

- [#144](https://github.com/jmchilton/galaxy-tool-util-ts/pull/144) [`ce78ceb`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ce78ceb24b05b26d506d2a642a8fc6b08bbc770c) Thanks [@jmchilton](https://github.com/jmchilton)! - fix(schema): emit a located diagnostic instead of throwing on a string-valued container parameter

  The schema-aware walker rejects a scalar where a container parameter
  (`gx_section`/`gx_repeat`/`gx_conditional`) is expected. It now throws a typed
  `StringContainerError` carrying the offending parameter's flat state path and
  container type, instead of a bare `Error` whose only structured data lived in
  the English message — mirroring the existing `UnknownKeyError`.

  The tool-state validators whose contract is to _return_ diagnostics
  (`validateFormat2StepStateStrict`, `ToolStateValidator.validateNativeStep` /
  `validateFormat2Step`) now catch `StringContainerError` and map it to a located
  `ToolStateDiagnostic` (dot-separated path), so one malformed step no longer
  crashes the whole validation pass. Conversion paths still throw, and the error
  message is unchanged so existing `message.includes("legacy parameter encoding")`
  consumers keep working.

## 1.8.2

### Patch Changes

- [#140](https://github.com/jmchilton/galaxy-tool-util-ts/pull/140) [`2667764`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/2667764b8ec967aa15856c0dc522cac7d61edd4a) Thanks [@jmchilton](https://github.com/jmchilton)! - fix(schema): stop leaking derived in-memory fields into serialized workflows

  `serializeWorkflow` now strips the normalization-only fields `unique_tools`
  (workflow level) and `connected_paths` (step level) before emitting. These are
  `Set`s built during normalization and never part of the on-disk Galaxy format;
  serializing a `Set` produced a stray `{}` / empty mapping that downstream schema
  validators (e.g. VS Code's Native Workflow Schema) reject. The strip walks the
  workflow structurally — including native `subworkflow` and format2 `run` embeds —
  so a tool parameter literally named `unique_tools`/`connected_paths` inside
  `tool_state` is preserved. Fixes stray keys in `gxwf convert` output.

## 1.8.0

### Minor Changes

- [#134](https://github.com/jmchilton/galaxy-tool-util-ts/pull/134) [`5a97723`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/5a9772309b463c88f7f7576f5a7de1eca2a8f0f0) Thanks [@jmchilton](https://github.com/jmchilton)! - feat(schema): export `normalizeStepIn` / `normalizeStepOut` step shorthand expanders

  The per-step `in:` / `out:` shorthand expansion logic used internally by
  `normalizedFormat2` is now public. Both are pure and value-based (no AST
  awareness), so consumers holding a raw gxformat2 step dict — e.g. the
  VS Code language server walking a parsed document — can reuse the canonical
  shorthand rules instead of re-deriving them.

  `normalizeStepIn` covers every form: list-of-strings, list-of-objects,
  map-to-string, map-to-object, and the map-to-list (multi-source) shorthand.
  Pairs with the existing `nativeConnectionsFromFormat2In` to build a native
  connections map from a raw step's `in:` block.

### Patch Changes

- [#129](https://github.com/jmchilton/galaxy-tool-util-ts/pull/129) [`e7b6af5`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e7b6af5e700bc8438690131ec75cb1a070650601) Thanks [@jmchilton](https://github.com/jmchilton)! - fix(draft-validate): stop counting output-source sentinels as step paths

  `buildDraftSurveyReport` deduped every TODO sentinel by step path, so
  workflow-output `outputSource` sentinels — all carrying the workflow-root
  path `[]` — collapsed into a single empty bucket and were surfaced as one
  extra "step path" (off-by-one). Output sentinels now get their own
  `DraftSurveyReport.todo_output_paths` bucket, keyed by `[...path, outputLabel]`,
  and the `gxwf draft-validate` survey line / report template report them as
  "N step path(s) and M output path(s)".

- [#133](https://github.com/jmchilton/galaxy-tool-util-ts/pull/133) [`d11e393`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d11e3932c509f53efeeed69853f486cf36693785) Thanks [@jmchilton](https://github.com/jmchilton)! - fix(roundtrip): match steps by label+type so reverse-pass renumbering doesn't misalign diffs

  `roundtripValidate` matched original and reimported steps by numeric `id`. But
  format2 stores inputs separately from `steps`, so the reverse (format2→native)
  pass front-loads input steps and renumbers tools — a native step's id is not
  stable across a roundtrip. When inputs were interleaved with tools, the diff
  compared unrelated steps, producing phantom "step missing after roundtrip" and
  value-mismatch errors (e.g. a tool's state diffed against an input, or two
  same-tool steps diffed against each other).

  Port Python's `_build_step_id_mapping` (`roundtrip.py`): match by label+type,
  then same-id when the type matches, then a unique tool_id+type fallback for
  unlabeled steps that shifted position, scoped per nesting level. Fixes [#117](https://github.com/jmchilton/galaxy-tool-util-ts/issues/117)
  (clinicalmp-discovery's apparent peptideshaker step drop + dbbuilder `source`
  mis-selection were both artifacts of this misalignment, not conversion bugs).

## 1.7.2

### Patch Changes

- [#124](https://github.com/jmchilton/galaxy-tool-util-ts/pull/124) [`25b6e15`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/25b6e15c797647e9f12a887a95c55c265fa30f3f) Thanks [@jmchilton](https://github.com/jmchilton)! - fix: deduplicate `galaxyWorkflowDraftJsonSchema` via `$defs`/`$ref`

  `JSONSchema.make` inlines every subschema lacking an `identifier` annotation, so
  structurally-identical fragments (workflow step variants, tool_state value types,
  RuntimeValue/ConnectedValue, …) were duplicated many times over — inflating the plain-JSON
  draft schema to ~95 KB compact / ~580 KB pretty-printed. A schema-aware post-process now
  hoists each repeated subschema into `$defs` and replaces its occurrences with `$ref`,
  operating only at legal schema positions (`properties` values, `items`, `anyOf` members, …)
  and never on array/value keywords like `required`/`enum`/`type`. The result is ~19 KB
  compact / ~60 KB pretty-printed with identical validation behavior (still compiles under
  Ajv 2020-12; accepts/rejects the same documents), so downstream packagers that vendor the
  schema verbatim no longer ship a ~580 KB file per bundle.

## 1.7.1

### Patch Changes

- [#121](https://github.com/jmchilton/galaxy-tool-util-ts/pull/121) [`d15c5c0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d15c5c0543aca01901f34e28eda66ba1ac3a5242) Thanks [@jmchilton](https://github.com/jmchilton)! - Emit format2 YAML with the `yaml-1.1` schema so reserved words quote. `serializeWorkflow` previously stringified with the default core (1.2) schema, leaving word-form booleans (`no`/`yes`/`on`/`off`) bare; a YAML 1.1 reader (e.g. Galaxy's PyYAML) then coerced them to booleans, corrupting string tool_state values like a select's `"no"`. Real numbers and booleans are unaffected.

## 1.7.0

### Minor Changes

- [#109](https://github.com/jmchilton/galaxy-tool-util-ts/pull/109) [`d51a18b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d51a18b2f19ce5d3cce8fe8b6a4ff0053ac2af60) Thanks [@jmchilton](https://github.com/jmchilton)! - Export `galaxyWorkflowDraftJsonSchema` — a plain JSON-Schema (2020-12) sibling of `GalaxyWorkflowDraftSchema`. Effect schema values are functions and do not survive `JSON.stringify`; the new export lets downstream packagers (e.g. Foundry's cast pipeline) bundle the draft schema verbatim. Closes [#108](https://github.com/jmchilton/galaxy-tool-util-ts/issues/108).

- [#114](https://github.com/jmchilton/galaxy-tool-util-ts/pull/114) [`8afd4d0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8afd4d064180231bdba0b386746deb48da44eeb8) Thanks [@jmchilton](https://github.com/jmchilton)! - format2 conversion + validate: honor the `state` vs `tool_state` contract.

  **Converter:** `toFormat2Stateful` now writes a successful schema-aware conversion to the format2 `state` field (with connections/runtime lifted into `in:`), and only falls back to raw `tool_state` when conversion is unavailable or fails — matching gxformat2's `state_encode_to_format2` contract. Previously the clean state was incorrectly written to `tool_state`, leaving the `state` field unused even though the native-side reader already expects it.

  **Validate:** `gxwf validate` now picks the validator by state shape, not workflow format. A schema-aware `state` block validates against the format2 model as before; a verbatim native `tool_state` block (what the state-unaware conversion copies in, with inline `ConnectedValue`/`RuntimeValue` markers) validates against the native model — the same one native `.ga` steps use. This fixes the false-positive `fail` on inline `RuntimeValue`, which the native model accepts, and gives real validation coverage instead of a skip. Replacement-parameter (`${...}`) tool_state still skips as `skip_replacement_params`.

  Together: a successful stateful conversion produces a validatable `state` block; an unaware/failed conversion produces a `tool_state` block that validate now checks via the native path. Closes [#113](https://github.com/jmchilton/galaxy-tool-util-ts/issues/113).

  **Mutual exclusion:** `validate_format2` (and its strict variant) now reject a step that specifies both `state` and `tool_state` — the schema has always documented "only one or the other should be specified", but the rule was previously unenforced. The check uses non-empty semantics, so an empty `state: {}` left by conversion does not falsely conflict with a populated `tool_state`. Mirrors the matching enforcement added upstream in gxformat2's semantic validators.

### Patch Changes

- [#115](https://github.com/jmchilton/galaxy-tool-util-ts/pull/115) [`455fdcb`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/455fdcbcf8eaa6060f45dec9f4fbabd138252673) Thanks [@jmchilton](https://github.com/jmchilton)! - Stateful conversion: drop disconnected-optional `RuntimeValue` markers and stop double-stamping connected params.

  `convertStateToFormat2` now evaluates each leaf connection-first with an early return, then gates `RuntimeValue` handling on optionality (mirrors Galaxy's Phase 1 converter change):
  - A `RuntimeValue` on an **optional, disconnected** leaf is omitted entirely — no state key and, crucially, no phantom `in:` connection claiming `source: "runtime_value"`. This is native authored content (a real optional input the user left unset), not a missed connection, so format2 should carry no trace of it. Verified against the IWC `average-bigwig-between-replicates` workflow, whose `advancedOpt|blackListFileName` now drops cleanly.
  - A `RuntimeValue` on a **required, disconnected** leaf still records the placeholder (correct `workflow_step_linked` behavior).
  - A leaf that is **connected** — via `input_connections` or a `ConnectedValue` marker — is always treated as a pure connection, even when the native state also carries a stray `RuntimeValue` marker (legacy workflows do this). The previous empty-`if`/fall-through double-stamped these with a runtime placeholder.

  Roundtrip diffing already classifies a dropped optional `RuntimeValue` as benign (`connection_only_section_omitted`), so no roundtrip change was needed.

- [#118](https://github.com/jmchilton/galaxy-tool-util-ts/pull/118) [`38ff7d2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/38ff7d2f235a34f81785768dd5299d8e1fbe76a1) Thanks [@jmchilton](https://github.com/jmchilton)! - Fix format2 two-level JSON Schema validation to match Galaxy:
  - A connected `multiple` select now validates against `workflow_step_linked`. `injectConnectionsIntoState` gained a `{ linked: true }` option that encodes the marker as a single-element list `[{ConnectedValue}]` (the linked select-multiple schema accepts ConnectedValue only as an array item, per `parameter_specification.yml`), instead of the bare `{ConnectedValue}` that the schema rejected.
  - `validateFormat2StepsJsonSchema` no longer crashes (`"/schemas/unknown" resolves to more than one schema`) on tools with two or more unknown/any params — each schema compiles in its own ajv instance with `$id` stripped.
  - Structural JSON Schema validation is non-strict (additional properties allowed) and unmatched connection keys (e.g. the `when` gate) are tolerated, matching Python's `validate_workflow_json_schema`.

- [#116](https://github.com/jmchilton/galaxy-tool-util-ts/pull/116) [`0f36639`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0f36639ea065bb330c24c512224fb5e1ae74187e) Thanks [@jmchilton](https://github.com/jmchilton)! - Dispatch the `Tests` output-assertion and collection-element unions via a `class` discriminator (`if/then/else`) in the generated test-format JSON Schema. Galaxy's Pydantic model uses callable `Discriminator` functions that don't serialize to JSON Schema, so `model_json_schema()` degraded them to a plain `oneOf` and `validateTestsFile` wrongly accepted class-less collection assertions. The sync script now rewrites those unions so ajv matches the Pydantic runtime.

## 1.6.0

### Minor Changes

- [#106](https://github.com/jmchilton/galaxy-tool-util-ts/pull/106) [`ac53ba0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ac53ba0e0f38979dc70fc83763fa1f1c5ba8d5ec) Thanks [@jmchilton](https://github.com/jmchilton)! - Promote `draft-extract` to a first-class command + add `--concrete` to `draft-validate`:
  - **cli**: rename `_draft-extract` → `draft-extract` (no longer hidden from `gxwf --help` or the generated skill doc). Same behavior, same flags.
  - **cli**: `gxwf draft-validate --concrete <file>` runs the extract pipeline (`extractConcreteSubset` → `stripPlanFields` → `promoteFullyConcreteDrafts`) and then runs the regular `gxwf validate` checks on the trimmed workflow. Forwards the relevant validate flags:
    - `--cache-dir <dir>` + `--no-tool-state` — tool-state validation (default on; matches `gxwf validate`)
    - `--connections` — connection-type compatibility
    - `--strict` / `--strict-structure` / `--strict-encoding` / `--strict-state`
      Any concrete-pass failure escalates the exit code to 1. When the extracted subset is still a draft (not fully promoted), every concrete-stage check is skipped, not failed.
  - **schema**: `SingleDraftValidationReport` gains an optional `concrete` field (`ConcreteValidationReport`) populated when `--concrete` was requested. Carries `class_after`, `skipped_reason`, `structure_errors`, plus optional `strict_structure_errors`, `strict_encoding_errors`, `strict_state_errors`, `tool_state`, `connection_report` depending on which flags were forwarded. `ok` is tri-state: `true` when every check ran clean, `false` when any failed, `null` when the concrete pass was skipped (e.g., subset still draft). Skipped concrete does NOT drag the aggregate `report.ok` down — consumers must treat `null` as "unknown," not as a pass. `buildSingleDraftValidationReport` takes an optional third arg.

### Patch Changes

- [#106](https://github.com/jmchilton/galaxy-tool-util-ts/pull/106) [`ac53ba0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ac53ba0e0f38979dc70fc83763fa1f1c5ba8d5ec) Thanks [@jmchilton](https://github.com/jmchilton)! - Expose `GalaxyWorkflowDraftSchema` / `DraftWorkflowStepSchema` (and their `GalaxyWorkflowDraft` / `DraftWorkflowStep` types) from the package root for downstream consumers. Previously reachable only at the deep `./workflow/raw` path; now importable as `import { GalaxyWorkflowDraftSchema } from "@galaxy-tool-util/schema"` alongside `GalaxyWorkflowSchema` / `NativeGalaxyWorkflowSchema`. Additive — no migration.

## 1.5.0

### Minor Changes

- [#100](https://github.com/jmchilton/galaxy-tool-util-ts/pull/100) [`b8e61b0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b8e61b0e1908149a683e1c9b86876346e3ad325d) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `draft-checks.ts` module — pure logic for Galaxy draft workflows (`class: GalaxyWorkflowDraft`). Exports `TODO_SENTINEL_PATTERN`, `PLAN_FIELDS`, `DRAFT_CLASS` constants plus `isTodoSentinel`, `isDraftWorkflow`, and `detectDraft(workflow): DraftSurvey` for collecting every TODO sentinel and `_plan_*` field with its step path. Subworkflow-aware: recurses into `run:` blocks only when the inner workflow is itself a draft. No CLI surface yet — substrate for forthcoming `gxwf draft-*` commands.

  Sentinel constants are kept in sync with upstream `gxformat2/draft.py` via a new `make check-sync-draft-sentinel` target wired into `make check`; `sync-schema-sources` snapshots the upstream constants to `schema-sources/v19_09/draft_constants.json` when a draft-aware gxformat2 checkout is available.

- [#105](https://github.com/jmchilton/galaxy-tool-util-ts/pull/105) [`cda837c`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/cda837cbe95a64654c088c299bd2e6cb812dd7dd) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `extractConcreteSubset(workflow): ExtractResult` to the draft-checks module — trims a draft Galaxy workflow down to the subset that could plausibly run.

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

- [#105](https://github.com/jmchilton/galaxy-tool-util-ts/pull/105) [`44a437c`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/44a437c214b4de7947e6f3e0cbe8d5262b510451) Thanks [@jmchilton](https://github.com/jmchilton)! - Add the draft-extract pipeline:
  - **schema**: new helpers `stripPlanFields` (remove `_plan_*` planning fields from steps + workflow root, recursive into draft subworkflows) and `promoteFullyConcreteDrafts` (flip `class: GalaxyWorkflowDraft` → `class: GalaxyWorkflow` on any (sub)workflow that is now fully concrete). Plus `SingleDraftExtractReport` + `buildSingleDraftExtractReport` sidecar report model. `extractConcreteSubset` and its drop/rewrite types are now re-exported from the package root.
  - **cli**: new hidden command `gxwf _draft-extract <file>` — pipes a draft workflow through `extractConcreteSubset` → `stripPlanFields` → `promoteFullyConcreteDrafts` and emits the trimmed workflow (YAML to stdout or `-o file`; `.ga`/`.json` extensions trigger native JSON serialization). Optional `--report-json [file]` sidecar. Rejects the stdout-collision case where the workflow + `--report-json` would both write to stdout. Hidden from `gxwf --help` and from the generated skill doc.
  - **cli/meta**: `SpecCommand.hidden?: boolean` — declarative way to mark a command as hidden from help. `buildProgramFromSpec` honors it; the skill generator (`make gen-skill`) skips hidden commands too.
  - **cli/internal**: new `findStdoutSinkCollision` helper in `report-output.ts` — generalizes the C-fixup `findStdoutSinkConflict` to accept arbitrary `{flag, toStdout}` pairs, so commands whose stdout sinks aren't drawn from `--json` / `--report-{html,markdown}` can reuse the same check.

- [#100](https://github.com/jmchilton/galaxy-tool-util-ts/pull/100) [`001ded9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/001ded9a4cbe7f2a2ce3838ed4ee480bba8ad2a9) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `nextDraftStep(workflow): NextStepResult` — pure, idempotent function that returns the next step a downstream agent should work on. Walks steps in topological order with alphabetical tie-break; first step carrying any TODO sentinel or `_plan_*` field returns with a prompt-shaped `work[]` array in the locked-decision order (tool*id → tool_version → in.* → out.\_ → \_plan_state → \_plan_context → \_plan_in → \_plan_out).

  Work items embed semantic hints stripped from `TODO_<hint>` port names and, for `out:` ports, the workflow-output labels that reference them (helps the next agent pick the right wrapper port). Subworkflow-aware: descends into draft `run:` blocks only after the outer step is itself fully concrete.

  Returns `{ draft: false }` when there's nothing left to do (including non-draft documents).

- [#100](https://github.com/jmchilton/galaxy-tool-util-ts/pull/100) [`f63f210`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/f63f21094f24bacc36d9c18cd634c8790f285c57) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `validateDraft(workflow)` to the draft-checks module. Collects all diagnostics into a structured `DraftValidationResult { ok, structureErrors, topologyErrors, semanticErrors, warnings, survey }` — does not throw.

  Checks:
  - structural decode against `GalaxyWorkflowDraftSchema`
  - concrete-topology: workflow input/output/step labels and step types cannot be TODO sentinels
  - syntactic edge resolution: every `step/port` source ref must resolve to a declared step + declared port (TODO\_\* ports count if declared in the source step's `out:`)
  - sentinel form: TODO-shaped strings that don't match `^TODO(_[a-z0-9_]+)?$` (e.g. `TODO-foo`, `TODOfoo`, `TODO_`) emit semantic errors
  - warnings: bare `TODO` in port position (canonical form is `TODO_<hint>`), and top-level `_plan_*` fields (planning fields belong on individual steps)

  Recurses into draft subworkflows (`run:` with `class: GalaxyWorkflowDraft`); diagnostic step paths are prefixed with the outer chain.

- [#105](https://github.com/jmchilton/galaxy-tool-util-ts/pull/105) [`1d53e62`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/1d53e628e4a1a6e771e090897194f72391087b2b) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `SingleDraftValidationReport` + `buildSingleDraftValidationReport` to `workflow/report-models.ts`. Wraps `DraftValidationResult` (from the draft-checks module) in the snake_case, frontend-compatible report shape the upcoming `gxwf draft-validate` CLI command emits via `--json`. Includes a `DraftSurveyReport` summary deduped to one entry per step path (TODO paths + plan-field paths), a `summary` string ("draft valid" / "draft valid (N warnings)" / "M errors[, N warnings]"), and faithful pass-through of structure / topology / semantic / warning diagnostics.

  Substrate for workstream C; no CLI surface yet.

- [#100](https://github.com/jmchilton/galaxy-tool-util-ts/pull/100) [`5b0b3be`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/5b0b3bed3892c965263b30e00b87e0d7140f34e3) Thanks [@jmchilton](https://github.com/jmchilton)! - Wire the new gxformat2 draft workflow schema (`class: GalaxyWorkflowDraft`) through `make sync` + `make generate-schemas`. Adds `gxformat2-draft.ts` / `gxformat2-draft.effect.ts` to `packages/schema/src/workflow/raw/` and re-exports `DraftWorkflowStep`, `GalaxyWorkflowDraft`, `DraftWorkflowStepSchema`, `GalaxyWorkflowDraftSchema` from the raw barrel. Draft steps carry the `_plan_state` / `_plan_context` / `_plan_in` / `_plan_out` optional string fields with their literal underscore-prefixed keys preserved by the Effect Schema generator. No runtime behavior change yet; downstream draft-checks logic will land in a follow-up.

- [#103](https://github.com/jmchilton/galaxy-tool-util-ts/pull/103) [`9053be9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9053be9e54a8095bb950d1e57cd6b95134ec3578) Thanks [@jmchilton](https://github.com/jmchilton)! - Inline UDT resolver for connection validation (jmchilton/galaxy-tool-util-ts#101). Also refreshes the parsed_tools/ fixture cache to pick up new ParsedTool fields (`requirements`, `containers`, `stdio`) added upstream — incidental to this PR; the TS-side `ParsedTool` schema ignores them. TS port of Galaxy's `_inline_tool` module on the `wf_tool_state` branch: `@galaxy-tool-util/schema` now ships `parseInlineTool(repr)` (full port of `parse_tool(YamlToolSource(repr))` covering id/version/name/description, inputs, outputs, citations, license, profile, edam, xrefs, help). `@galaxy-tool-util/connection-validation` ships `resolveForStep`, `InlineResolver`, `ensureInlineResolver`, and `collectInlineTools`; `buildWorkflowGraph` wraps its resolver in an `InlineResolver` so inline `tool_representation` steps (with `class: GalaxyUserTool`) resolve without a remote lookup. `buildGetToolInfo` walks inline reps up-front and pre-parses them into the cache, surfacing parse errors via `onMiss` alongside ToolShed misses. Unblocks UDT fixtures in the connection-validation corpus (eight new fixtures pulled byte-identical from Galaxy's `wf_tool_state` branch).

- [#99](https://github.com/jmchilton/galaxy-tool-util-ts/pull/99) [`e4e46e0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e4e46e0e4625532363c2d10b9c3beeaa03d05ed4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add cross-field semantic validation for Format2 workflow inputs (mirrors gxformat2 [#212](https://github.com/jmchilton/galaxy-tool-util-ts/issues/212) + [#216](https://github.com/jmchilton/galaxy-tool-util-ts/issues/216)). New `semantic-validators.ts` module rejects `restrictions:` / `suggestions:` / `restrictOnConnections:` on non-text inputs, `column_definitions:` on non-`sample_sheet` collections, column-default-vs-type mismatches, and `fields:` on non-record collection inputs. Wired into `validateFormat2` / `validateFormat2Strict`.

- [#99](https://github.com/jmchilton/galaxy-tool-util-ts/pull/99) [`941ac0e`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/941ac0e3b373521db8814003cc9dcf5a7bb9115f) Thanks [@jmchilton](https://github.com/jmchilton)! - Propagate step-level `post_job_actions:` through Format2 → native (mirrors gxformat2 [#210](https://github.com/jmchilton/galaxy-tool-util-ts/issues/210)). Explicit PJAs merge alongside (and win key collisions over) `out:`-shorthand-derived entries. Action types without an `output_name` (e.g. `ValidateOutputsAction`) now round-trip instead of being silently dropped. Native `output_name` becomes optional via schema regen.

- [#94](https://github.com/jmchilton/galaxy-tool-util-ts/pull/94) [`62dc8a7`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/62dc8a71ba284022e2be5bf607fcead523df0370) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `validateUserToolSource` and `gxwf validate-tool-source[-tree]` for validating user-defined Galaxy tool source YAML (`class: GalaxyUserTool` / `GalaxyTool`) against the Galaxy `DynamicToolSources` JSON Schema plus the semantic checks from galaxyproject/galaxy#22615 (input refs in `shell_command`/`configfiles`, output discovery requirements, citation DOI/BibTeX shape, blank required fields). Schema is synced via `make sync-user-tool-source-schema`; sha256 verified by `make check`.

- [#105](https://github.com/jmchilton/galaxy-tool-util-ts/pull/105) [`ae33d9d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ae33d9d6de39475e2646f2d8790ada7d12cfd676) Thanks [@jmchilton](https://github.com/jmchilton)! - `validateDraft` now flags `_plan_*` fields on a fully-resolved tool step as
  a semantic error. Non-tool steps (subworkflow / pause / pick*value) keep
  the v1 carve-out — `\_plan*\*`is allowed there. Closes the gap where the
locked metaplan decision was operationally enforced only by`extractConcreteSubset`'s drop; the validate-time contract now matches.

### Patch Changes

- [#102](https://github.com/jmchilton/galaxy-tool-util-ts/pull/102) [`fcef54f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/fcef54fdc27d228040ae45aeec7019f32368e344) Thanks [@jmchilton](https://github.com/jmchilton)! - Fix-ups to `draft-checks.ts` from an independent review pass:
  - `detectDraft` now reads TODO sentinels from list-form step `in:` entries (`in: [{ id: "TODO_x", source: "..." }]`), matching the long-supported list-form coverage in `validateDraft`. Previously dict-form was the only path that hit the sentinel walker.
  - `validateDraft` now emits the "top-level `_plan_*`" warning at every draft root (outer document + every nested draft subworkflow root), not just the outermost. Inner-draft `_plan_*` was previously silent.
  - `TODO_LIKE` heuristic anchored to `/^TODO([_-]|$)/` (was `/^TODO/`), so identifiers like `TODONE`, `TODOLIST` no longer false-positive as "malformed sentinels."
  - Added a documentation comment clarifying the intentional asymmetry between `detectDraft` (step-focused survey; ignores top-level `_plan_*`) and `validateDraft` (rules-focused walker; warns).
  - Added documentation comment on inner-draft outputs path convention (path = outer step's path, mirrors how subworkflow steps reach their inner workflow).

  7 new tests covering each fix-up + an input-ordering idempotence test for `nextDraftStep`.

- [#105](https://github.com/jmchilton/galaxy-tool-util-ts/pull/105) [`527b8b8`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/527b8b88e812219ae0a9965a4b3090d9c902575a) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `gxwf draft-validate <file>` — single-file validation of draft Galaxy workflows (`class: GalaxyWorkflowDraft`). Wraps `validateDraft` from `@galaxy-tool-util/schema`; emits a human-readable text summary by default, with `--json` (full `SingleDraftValidationReport`), `--report-html` (self-contained gxwf-report-shell page), and `--report-markdown` (new `draft_validate.md.j2` template) modes. Exit codes: `0` clean (warnings allowed), `1` topology/semantic errors, `2` parse failure / class mismatch / structural decode failure / `--format native` on a draft. Tree variant (`draft-validate-tree`) and connection validation against concrete tool ids are deferred to v2.

  Schema patch: re-export `buildSingleDraftValidationReport` and the `DraftValidationDiagnosticReport` / `DraftSurveyReport` / `SingleDraftValidationReport` types from the package root index so CLI callers don't have to reach into the `workflow/` subpath.

- [#99](https://github.com/jmchilton/galaxy-tool-util-ts/pull/99) [`f9e4ede`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/f9e4ede76a5e9353dd60009e3d5aa7523cd232fe) Thanks [@jmchilton](https://github.com/jmchilton)! - `make generate-schemas` now pipes generator output through prettier so regenerated `raw/*.ts` files land prettier-conforming in the same step (no more separate post-sync `format-fix` commit).

- [#99](https://github.com/jmchilton/galaxy-tool-util-ts/pull/99) [`22a982b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/22a982b28b1e028192cd892c96a629cb7112c7be) Thanks [@jmchilton](https://github.com/jmchilton)! - Accept bare-list multi-source and integer `$link` in Format2 step inputs (mirrors gxformat2 [#211](https://github.com/jmchilton/galaxy-tool-util-ts/issues/211)).

- [#99](https://github.com/jmchilton/galaxy-tool-util-ts/pull/99) [`2bdd932`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/2bdd932e8dc0acc1010f94493fa7fbc7d2a4a16d) Thanks [@jmchilton](https://github.com/jmchilton)! - Propagate Format2 step input defaults through `to_native` (mirrors gxformat2 [#213](https://github.com/jmchilton/galaxy-tool-util-ts/issues/213)). Tool and subworkflow steps now emit `step.in = {input: {default: ...}}` for each `WorkflowStepInput` with a non-null default.

## 1.2.0

### Minor Changes

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`8261f8d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8261f8d95040ad76a053ce3bf5048de53c41dda9) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `--layout <name>` to `gxwf cytoscapejs` (and the underlying
  `cytoscapeElements({ layout })` builder option).

  `preset` (default) keeps today's coordinate-from-NF2 emission byte-for-byte,
  including the Python `(10*i, 10*i)` fallback. `topological` overwrites every
  node's `position` using a small longest-path layering algorithm — pinned in
  `docs/architecture/cytoscape-layout.md` so the gxformat2 port can land
  byte-equal coordinates. Hint-only layouts (`dagre`, `breadthfirst`, `grid`,
  `cose`, `random`) drop `data.position` and emit a top-level
  `layout: { name: "<n>" }` hint that the bundled HTML viewer (now ships
  `cytoscape-dagre`) and `gxwf-ui` honor at view time.

  JSON output gains a `{ elements, layout }` wrapper when `--layout` is
  non-default. The default `preset` flow continues to write a bare list for
  Python parity.

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`0124600`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0124600f0cd42210f20989c6626ece034d13dfe5) Thanks [@jmchilton](https://github.com/jmchilton)! - Port gxformat2's `gxwf-viz` to TS as `gxwf cytoscapejs`.
  - `@galaxy-tool-util/schema` exports `cytoscapeElements()` + `elementsToList()` plus
    output-only TS interfaces (`CytoscapeNode`, `CytoscapeEdge`, `CytoscapeElements`, …).
    Snake_case field names + edge-id format are preserved byte-for-byte with the
    Python emitter so the JSON is interchangeable.
  - `gxwf cytoscapejs <file> [output]` (`--html` / `--json`) renders a workflow as
    Cytoscape.js JSON or a standalone HTML viewer. Defaults to stdout JSON when no
    output path is given (diverges from Python's "write `.html` next to input").
  - The HTML template is synced verbatim from gxformat2 via the new
    `cytoscape-template` group in `scripts/sync-manifest.json` and bundled into
    the CLI dist as a string constant.
  - 13 declarative parity cases (synced `cytoscape.yml`) run against the TS
    builder via the existing harness — no sidecar JSON goldens.

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`8cfbe32`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8cfbe327f69ce09578ac49c3eff39282ba66c7fc) Thanks [@jmchilton](https://github.com/jmchilton)! - Encode map-over depth + reductions on workflow diagram edges.

  Phase B of the workflow visualization plan. Threads connection-validation
  results into the mermaid and cytoscape emitters so edges visually distinguish
  mapped, list-paired-mapped, and reducing connections.
  - `connection-validation`: `ConnectionValidationResult` gains `mapDepth` /
    `reduction` (also surfaced as `map_depth` / `reduction` in
    `ConnectionResult`); `StepConnectionResult` gains an optional `label`. New
    `buildEdgeAnnotations(report)` returns a `Map<string, EdgeAnnotation>`
    keyed by step labels for emitter consumption.
  - `schema`: `MermaidOptions.edgeAnnotations` and a new
    `CytoscapeOptions.edgeAnnotations` thread the lookup into emit. Mermaid
    draws thick `==>|"<mapping>"|` for map-over edges and dashed
    `-. "reduce" .->` for reductions, with a consolidated `linkStyle` block.
    Cytoscape edges gain `data.map_depth` / `data.reduction` / `data.mapping`
    plus `mapover_<n>` / `reduction` classes; the bundled HTML viewer styles
    these and shows depth/reduction in edge tooltips.
  - `cli`: `gxwf mermaid` and `gxwf cytoscapejs` accept
    `--annotate-connections` (with `--cache-dir`) — opt-in; default emit shape
    stays byte-identical with Python.

  Note: `map_depth` / `reduction` on `ConnectionResult` are TS-only enrichments
  ahead of a planned Galaxy Python parity addition.

### Patch Changes

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`016385b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/016385bb0e40a9cbe1f6c55d9d18829917914df0) Thanks [@jmchilton](https://github.com/jmchilton)! - Fix mermaid + cytoscape diagram step labels for unlabeled native (`.ga`)
  steps. The native→format2 normalizer assigns synthetic ids of the form
  `_unlabeled_step_<n>` to steps without a label, which the diagram builders
  were rendering verbatim instead of falling through to the `tool:<tool_id>`
  display fallback. `workflowToMermaid` and `cytoscapeElements` now skip
  unlabeled-prefix step ids when computing the visible label, matching the
  documented `label || id || tool:tool_id || index` chain.

- [#89](https://github.com/jmchilton/galaxy-tool-util-ts/pull/89) [`ee543b5`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ee543b522c9181f0920969746e271e986fea3249) Thanks [@jmchilton](https://github.com/jmchilton)! - Type ParsedTool outputs against current Galaxy output models.

## 1.1.0

### Minor Changes

- [#68](https://github.com/jmchilton/galaxy-tool-util-ts/pull/68) [`3b97a0f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3b97a0f41c2358aa663df4e6490488e89c9ba9e5) Thanks [@jmchilton](https://github.com/jmchilton)! - UI polish: auto-preview for clean/export/convert with explicit apply buttons (no more dry-run toggle). Lint report now surfaces error/warning messages alongside counts via new `lint_error_messages` / `lint_warning_messages` fields on `SingleLintReport`.

### Patch Changes

- [#75](https://github.com/jmchilton/galaxy-tool-util-ts/pull/75) [`11a6625`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/11a66254a6c1c2640954ab4fbc41c59b0add0617) Thanks [@jmchilton](https://github.com/jmchilton)! - Re-sync vendored `tests.schema.json` from Galaxy `wf_tool_state` branch.

  Picks up upstream enrichment of `galaxy.tool_util_models.Tests`: new `Job`
  def, named `assertion_list` ref replacing the auto-generated discriminator
  blob, and added `title` fields on collection/file properties.

## 1.0.0

### Minor Changes

- [#63](https://github.com/jmchilton/galaxy-tool-util-ts/pull/63) [`afcd804`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/afcd804e03dacffd03821c3f75e2cae4a0340400) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `expandToolStateDefaults(toolInputs, currentState)` — port of Galaxy's `fill_static_defaults`. Fills scalar defaults for absent keys, recurses into conditionals (honoring user's active `test_value`), pads repeats to `min`, creates+fills absent sections. Does not validate; does not pre-seed data / data_collection (non-optional) / baseurl / color / directory_uri / group_tag / rules / data_column inputs. Walker gains a `repeatMinPad` option to support the expand-defaults repeat semantics.

- [#66](https://github.com/jmchilton/galaxy-tool-util-ts/pull/66) [`7b835d2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7b835d298c4863ac0573e9091f4b1b8c72c34fef) Thanks [@jmchilton](https://github.com/jmchilton)! - Port `workflow_to_mermaid` from gxformat2 and expose as `gxwf mermaid`.
  - `@galaxy-tool-util/schema`: new `workflowToMermaid(workflow, { comments? })` that renders a Mermaid flowchart string from any Format2 / native workflow input. Shapes inputs by type, strips the main toolshed prefix from tool IDs, deduplicates edges, and optionally renders frame comments as `subgraph` blocks.
  - `@galaxy-tool-util/cli`: new `gxwf mermaid <file> [output] [--comments]` command. Writes raw `.mmd` by default; `.md` output path wraps the diagram in a fenced `mermaid` code block; stdout if no output path.
  - Behavioral coverage driven by the declarative YAML suite synced from gxformat2 (`mermaid.yml` via `make sync-workflow-expectations`). Adds `value_matches` assertion mode to the shared declarative test harness.

- [#63](https://github.com/jmchilton/galaxy-tool-util-ts/pull/63) [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941) Thanks [@jmchilton](https://github.com/jmchilton)! - `ParsedTool` Effect Schema (plus `HelpContent`, `XrefDict`, `Citation`) now lives in `@galaxy-tool-util/schema` — it was moved from `@galaxy-tool-util/core`. This aligns package ownership: `schema` owns data models (parameter types, `ParsedTool`, workflow formats); `core` owns IO (`ToolInfoService`, `ToolCache`, HTTP clients).

  `ParsedTool.inputs` is now typed as `readonly ToolParameterModel[]` instead of `readonly unknown[]`. Runtime decode behavior is unchanged (the underlying Effect Schema is a permissive object-guard; trusted-peer payloads are still accepted) — downstream consumers get compile-time typing without having to cast.

  `ToolStateValidator` now accepts any `ToolInfoLookup` (`{ getToolInfo(toolId, toolVersion?) }`) instead of a concrete `ToolInfoService`. The `ToolInfoService` class in `@galaxy-tool-util/core` satisfies this interface structurally; no caller change required. This inverts the latent dependency — schema no longer needs a `@galaxy-tool-util/core` type import.

  Additional leaf parameter-model types are now exported from the public index: `IntegerParameterModel`, `FloatParameterModel`, `TextParameterModel`.

- [#63](https://github.com/jmchilton/galaxy-tool-util-ts/pull/63) [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `buildMinimalToolState(tool)` and step-skeleton builders (`buildNativeStep`, `buildFormat2Step`, `buildStep`) for inserting a freshly authored tool step into a workflow. `buildMinimalToolState` today always returns `{}` — the existing decoders/validators already handle absent keys via default conditional branches and parameter defaults — and is the designated extension point if that ever changes. Step-skeleton builders seed `tool_state` / `state` via `buildMinimalToolState` rather than hardcoding `{}`, so a single patch shifts the semantics without a codebase sweep. Native skeletons emit the object form of `tool_state` (not the double-encoded JSON string form) — matches what the VS Code clean pipeline expects. Skeletons are tested against both the raw Effect schema and the higher-level `validateNativeStepState` / `validateFormat2StepState` — any diagnostics emitted reference only the data / data_collection inputs the user is expected to wire after insertion.

## 0.4.0

### Minor Changes

- [#56](https://github.com/jmchilton/galaxy-tool-util-ts/pull/56) [`8404313`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8404313159eb3950fefbb4c6c2ad2c7ddc79eef5) Thanks [@jmchilton](https://github.com/jmchilton)! - Port linting-abstraction overhaul from gxformat2 (`adabd80..0aaf7ce`).

  **Structured `LintMessage`.** `LintContext.errors` / `warnings` are now
  `LintMessage[]` — each carries `message`, `level`, `linter`, and
  `json_pointer` alongside the prose. `toString()` returns the message so
  template interpolation (`${m}`) and existing string-like callers keep
  working. Primitives extracted into `packages/schema/src/workflow/linting.ts`
  mirroring Python's `linting.py`.

  **`Linter` base + pilot rule.** New `lint-rules.ts` carries metadata-only
  `Linter` subclasses. `NativeStepKeyNotInteger` is the first live rule, wired
  through `lint.ts` with `linter=` and `json_pointer=` options. `LintContext.child()`
  composes RFC 6901 JSON pointers instead of prefixing message text.

  **Lint profile catalog.** `lint_profiles.yml` (structural / best-practices /
  release) synced from gxformat2 via new `sync-lint-profiles` Makefile target
  and `lint-profiles` group in `scripts/sync-manifest.json`. Loader
  `parseLintProfiles` + helpers (`lintProfilesById`, `rulesForProfile`,
  `iwcRuleIds`, `IWC_PROFILE_NAMES`) re-exported from the package entry.
  YAML copied into `dist/` by `copy-schema-assets.mjs` so runtime consumers
  can load it from the published package.

  **Tests.** New `lint-context.test.ts` (mirrors `test_linting.py`) and
  `lint-profiles.test.ts` (mirrors `test_lint_profiles.py`). Declarative
  expectation assertions `[errors, 0, linter]` and `[errors, 0, json_pointer]`
  flow through the existing path navigator unchanged; `assertValueContains` /
  `assertValueAnyContains` coerce `LintMessage` objects via `.message` so
  prior string-based expectations remain green.

- [#56](https://github.com/jmchilton/galaxy-tool-util-ts/pull/56) [`f4ea125`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/f4ea12548ffe1a69f33970cd8de18b76cbe2e744) Thanks [@jmchilton](https://github.com/jmchilton)! - Add schema-rule catalog port from gxformat2.

  Mirrors gxformat2 commit `4b6ecd6`: synced `schema_rules.yml` describes
  decode-enforced checks with positive/negative fixtures and lax/strict scope.
  New `packages/schema/test/schema-rules-catalog.test.ts` parametrizes validation
  over the catalog (22 cases across 7 rules) and enforces integrity: every rule
  has positive + negative fixtures, fixture extensions match `applies_to`,
  referenced fixtures exist on disk and are covered by `scripts/sync-manifest.json`.

  Shared Effect-schema validator dispatch lifted into
  `src/workflow/validators.ts` and re-exported from the package entry point:
  `validateFormat2{,Strict}`, `validateNative{,Strict}`, `validatorForFixture`,
  and `withClass`. The `withClass` helper (class-discriminator injection, recursive
  over `.subworkflow` and format2 `.run` inline subworkflows) replaces ad-hoc
  copies in `validate-workflow.ts`, `validate-workflow-json-schema.ts`, and
  `strict-checks.ts`.

  The synced YAML catalog is now copied into `dist/` by a new
  `scripts/copy-schema-assets.mjs` build step so runtime consumers (future
  `--list-rules`, tooling) can load it from the published package.

  New Makefile target `sync-schema-rules` (and `check-sync-schema-rules`) keeps
  the catalog in lockstep with the upstream gxformat2 source.

## 0.3.0

### Minor Changes

- [#42](https://github.com/jmchilton/galaxy-tool-util-ts/pull/42) [`005adf3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/005adf3c61b088904f9b665985bba51b5eabf04e) Thanks [@jmchilton](https://github.com/jmchilton)! - Extend `cleanWorkflow()` with structural cleaning and tool-aware stale key removal.
  - `cleanWorkflow()` now strips Galaxy-injected `uuid` and `errors` from both native and format2 workflow/step dicts (not `position`, which is a legitimate workflow property)
  - Format2 workflows now return per-step `CleanStepResult[]` instead of an empty array
  - New optional `toolInputsResolver` option: when provided, drops keys not in the tool's parameter tree via `stripStaleKeysToolAware` (native) or `walkFormat2State` (format2) — steps whose tool is not found in the resolver are skipped gracefully
  - `cleanWorkflow()` signature is now `async` (returns `Promise<CleanWorkflowResult>`) — **breaking change** for callers that used the result synchronously
  - New export: `CleanWorkflowOptions`

- [#49](https://github.com/jmchilton/galaxy-tool-util-ts/pull/49) [`1af1f7d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/1af1f7dc3a84297c3d81bcf195781e7c010a6a0e) Thanks [@jmchilton](https://github.com/jmchilton)! - Mutating workflow ops + export/convert UI. Schema adds `ExportResult` / `ConvertResult` / `WorkflowSourceFormat`. Report shell adds `ExportReport.vue` and routes `"export"`/`"convert"` report types. UI switches workflow ops to POST, adds dry_run toggle on Clean, Export and Convert tabs with destructive-op confirmation and post-mutation workflow list refresh; Convert navigates back to the dashboard after removing the source. gxwf-client tests exercise POST export/convert and dry_run semantics.

- [#49](https://github.com/jmchilton/galaxy-tool-util-ts/pull/49) [`d0c9888`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d0c9888891e236e233c271c8788c9055ae69506b) Thanks [@jmchilton](https://github.com/jmchilton)! - Flip workflow operations to write-by-default and add export/convert.
  - All 6 `/workflows/{path}/{op}` endpoints now require POST (was GET).
  - `clean` writes cleaned content back to disk by default; pass `dry_run=true` to preview without writing.
  - New `export` endpoint writes the converted workflow alongside the original (`.ga` ↔ `.gxwf.yml`).
  - New `convert` endpoint writes the converted workflow and removes the original.
  - Removed `to-format2` and `to-native` endpoints (absorbed into `export`/`convert`).
  - Non-dry-run clean/export/convert auto-refresh the workflow index.
  - Fix pipe truncation in `gxwf-web --output-schema` for specs larger than the OS pipe buffer.

  Schema: promote `serializeWorkflow` and `resolveFormat` from `@galaxy-tool-util/cli` into `@galaxy-tool-util/schema` so the CLI and the web server share one format-aware serializer. New `SerializeWorkflowOptions` adds `indent` (default 2) and `trailingNewline` (default true). YAML output now uses `lineWidth: 0` consistently. CLI re-exports the helpers for backwards compatibility.

- [#45](https://github.com/jmchilton/galaxy-tool-util-ts/pull/45) [`54fc8f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54fc8f20720030cdbf690fd6e72066d7958fc9b5) Thanks [@jmchilton](https://github.com/jmchilton)! - Expose fine-grained strict options, clean-first validation, JSON-schema mode, and before/after workflow content in the gxwf-web server and report UI.

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

- [#35](https://github.com/jmchilton/galaxy-tool-util-ts/pull/35) [`e54a513`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e54a51342e3930b61bae3b27ce46925f186cc93c) Thanks [@jmchilton](https://github.com/jmchilton)! - Add Nunjucks-based Markdown report rendering for all tree CLI commands. Syncs 8 Jinja2 `.md.j2` templates from Python Galaxy branch and renders them via Nunjucks. Adds `--report-markdown [file]` and `--report-html [file]` flags to `validate-tree`, `lint-tree`, `clean-tree`, and `roundtrip-tree`. Adds missing `RoundTripTreeReport`, `ExportTreeReport`, `ToNativeTreeReport` types and builders to `@galaxy-tool-util/schema`.

- [#29](https://github.com/jmchilton/galaxy-tool-util-ts/pull/29) [`16652a9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/16652a94c21402a3ee9108a0cd118d8af18c4708) Thanks [@jmchilton](https://github.com/jmchilton)! - Add structured report models for workflow lint/validate/roundtrip results, matching Python's `_report_models.py`. Includes category grouping in tree reports and structured encoding/structure error types.

- [#28](https://github.com/jmchilton/galaxy-tool-util-ts/pull/28) [`b3b1b52`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b3b1b52d9bccd6fdd7e713281be076ecfd74ee34) Thanks [@jmchilton](https://github.com/jmchilton)! - Decompose --strict into --strict-structure, --strict-encoding, --strict-state

  Add three granular strict validation flags to all gxwf commands (validate, lint, convert, roundtrip + tree variants). --strict remains as shorthand for all three.
  - --strict-structure: reject unknown keys via Effect Schema onExcessProperty: "error"
  - --strict-encoding: reject JSON-string tool_state (native) and tool_state field misuse (format2)
  - --strict-state: promote skipped/unconverted steps to failures (exit 2)

  Schema package: new strict-checks.ts with checkStrictEncoding/checkStrictStructure, RoundtripResult gains encodingErrors/structureErrors with multi-stage validation, StepValidationResult gains skippedReason.

- [#59](https://github.com/jmchilton/galaxy-tool-util-ts/pull/59) [`e5352d1`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e5352d1dee68d0396ccc5227ec931d83a95793d2) Thanks [@jmchilton](https://github.com/jmchilton)! - Add workflow-test file validation (`*-tests.yml` / `*.gxwf-tests.yml`).
  - New JSON Schema vendored from Galaxy's `galaxy.tool_util_models.Tests` Pydantic model (single source of truth), refreshed via `make sync-test-format-schema` against a Galaxy checkout.
  - `@galaxy-tool-util/schema` exports `validateTestsFile(parsed)` and `testsSchema`; validation is backed by Ajv (draft 2020-12).
  - `gxwf validate-tests <file>` and `gxwf validate-tests-tree <dir>` commands validate parsed tests documents and print diagnostics (or `--json` report).
  - Canonical positive/negative fixtures live in `packages/schema/test/fixtures/test-format/` and are reusable by downstream consumers (VS Code plugin tests, Galaxy-side Python interop).
  - `make verify-test-format-schema` checksums the vendored schema against `tests.schema.json.sha256` (written by `make sync-test-format-schema`) so CI catches hand-edits and missed resyncs; wired into `make check`.
  - Reusable by the galaxy-workflows-vscode plugin: the vendored `tests.schema.json` replaces the plugin's stale hand-written schema.
  - Cross-check: when paired with a workflow, emits workflow-aware diagnostics (`workflow_input_undefined`, `workflow_input_required`, `workflow_input_type`, `workflow_output_undefined`).
    - New exports from `@galaxy-tool-util/schema`: `WorkflowInput` / `WorkflowOutput` DTOs, `extractWorkflowInputs` / `extractWorkflowOutputs` (format-aware via existing `resolveFormat`), format-specific `extractFormat2*` / `extractNative*`, `isCompatibleType` + `jsTypeOf`, `checkTestsAgainstWorkflow`. Canonical DTOs the VS Code plugin can vendor — plugin keeps AST-range mapping only.
    - CLI: `gxwf validate-tests --workflow <path>` cross-checks a single tests file against a workflow. `gxwf validate-tests-tree --auto-workflow` pairs each tests file with a sibling workflow by filename convention (`foo.gxwf-tests.yml` ↔ `foo.gxwf.yml`/`foo.ga`, `bar-tests.yml` ↔ `bar.yml`/`bar.ga`); silent no-op when no sibling is found.

- [#34](https://github.com/jmchilton/galaxy-tool-util-ts/pull/34) [`85194f8`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/85194f8e710bc586939bc31b0cf20fc2d1329680) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `ToolStateValidator` class — high-level bridge for validating tool_state in workflow steps without exposing Effect internals. Supports both native and format2 step validation, returning `ToolStateDiagnostic[]`.

- [#36](https://github.com/jmchilton/galaxy-tool-util-ts/pull/36) [`20f6943`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/20f694303d2f6b71dcb4689d79107306de5bf5aa) Thanks [@jmchilton](https://github.com/jmchilton)! - Abstractions to ease VS Code integration: export `ToolParameterModel` types + type guards from public index, add `findParamAtPath` + `validateFormat2StepStrict` helpers, consolidate `ToolStateDiagnostic` definition in `stateful-validate` (re-exported from `tool-state-validator`).

### Patch Changes

- [#46](https://github.com/jmchilton/galaxy-tool-util-ts/pull/46) [`a57f021`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/a57f021dbdbe6117a28add2b2e2f7520f09b068c) Thanks [@jmchilton](https://github.com/jmchilton)! - Normalize step position to left/top only in cleanWorkflow, porting Python's \_strip_position_extras. Adds normalizeStepPosition called via cleanNativeSteps for all steps including data_input inside subworkflows.

- [#47](https://github.com/jmchilton/galaxy-tool-util-ts/pull/47) [`8f8c0e1`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8f8c0e1f79d2da3b3db59a5136156a0878cfefe4) Thanks [@jmchilton](https://github.com/jmchilton)! - Regenerate workflow Effect Schemas with schema-salad-plus-pydantic 0.1.9

- [#19](https://github.com/jmchilton/galaxy-tool-util-ts/pull/19) [`7786c6f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7786c6f3a250dba31ba27be9ca0b4431bc0b0065) Thanks [@jmchilton](https://github.com/jmchilton)! - Unify walker: state-merge.ts inject/strip now delegate to walkNativeState, eliminating ~140 lines of duplicated parameter-tree traversal. Extract walk-helpers.ts for shared helper functions. No behavioral changes.

- [#60](https://github.com/jmchilton/galaxy-tool-util-ts/pull/60) [`fe80b5f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/fe80b5fe44c7f67a51fc9b8483e182edb6038c04) Thanks [@jmchilton](https://github.com/jmchilton)! - Add optional `type?: WorkflowDataType` to `WorkflowOutput`. Extractors leave it unset; downstream consumers (e.g. the VS Code plugin's AST extractor) populate it when the information is available.

## 0.2.0

### Minor Changes

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `gx_rules` parameter type support (RulesModel and RulesMapping), completing Galaxy parameter type coverage and eliminating all IWC sweep test gaps.

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `gxwf` CLI with validate, clean, lint, and convert subcommands plus tree (batch) variants for processing entire workflow directories. Single unified binary replaces prior tool-specific commands. Tree commands share a single tool cache load across all discovered workflows and produce aggregated summary reporting.

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add stateful workflow conversion between native and format2 with tool-aware parameter coercion (booleans, numbers, arrays). Includes pre-conversion eligibility checks, subworkflow recursion, per-step status reporting, and schema-aware roundtrip validation that classifies benign artifacts (type coercion, stale keys) vs real differences.

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `populate-workflow` and `structural-schema` commands to `galaxy-tool-cache` CLI. Add async external reference resolution for workflow imports supporting URL, base64, TRS, Galaxy @import, and file path strategies with cycle detection and depth limiting.

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Expand workflow validation with connection-aware state checking, legacy replacement parameter scanning, best-practices linting (annotations, creator, license, step labels), and format-specific validation paths. Add recursive tool state cleaning: stale key stripping, legacy JSON-encoded state decoding, and tool-aware pre-cleaning that respects declared parameter trees.
