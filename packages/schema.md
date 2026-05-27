# @galaxy-tool-util/schema

[Effect Schema](https://effect.website/docs/schema/introduction) definitions for [Galaxy](https://galaxyproject.org) parameter types and workflow models. This is the core validation engine — it takes a tool's parameter definitions and produces typed schemas that can validate [tool state](glossary#tool-state) and export to [JSON Schema](https://json-schema.org).

## Parameter Schemas

### `createFieldModel(bundle, stateRepresentation)`

The main entry point. Takes a tool's parameter bundle and a [state representation](glossary#state-representations), returns an Effect Schema that validates tool state for that representation.

```typescript
import { createFieldModel } from "@galaxy-tool-util/schema";
import * as JSONSchema from "effect/JSONSchema";

const bundle = { parameters: tool.inputs };
const schema = createFieldModel(bundle, "workflow_step");

// Use as Effect Schema for runtime validation
import * as S from "effect/Schema";
const result = S.decodeUnknownEither(schema)(toolState);

// Or export to JSON Schema
const jsonSchema = JSONSchema.make(schema);
```

Returns `undefined` if any parameter type in the bundle lacks a registered generator.

### State Representations

State representations control the shape of the generated schema. Different Galaxy contexts expect different parameter formats:

| Representation                  | Description                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `workflow_step`                 | Workflow editor step state — all fields optional, no connected values                                        |
| `workflow_step_linked`          | Workflow step with connections — parameters can be [`ConnectedValue`](glossary#connected-value) markers      |
| `workflow_step_native`          | Native (.ga) workflow state — parameters can be `ConnectedValue` or [`RuntimeValue`](glossary#runtime-value) |
| `request`                       | API request with string-encoded IDs                                                                          |
| `request_internal`              | Internal request with integer IDs                                                                            |
| `request_internal_dereferenced` | Dereferenced internal request                                                                                |
| `relaxed_request`               | Relaxed API request                                                                                          |
| `landing_request`               | Landing page request (all optional)                                                                          |
| `landing_request_internal`      | Internal landing request (all optional)                                                                      |
| `job_internal`                  | Job execution state — all fields required                                                                    |
| `job_runtime`                   | Job runtime state — all fields required                                                                      |
| `test_case_xml`                 | Test case from XML definition                                                                                |
| `test_case_json`                | Test case from JSON definition                                                                               |

### Parameter Type Registry

```typescript
import { registeredParameterTypes, isParameterTypeRegistered } from "@galaxy-tool-util/schema";

// All supported types
const types = registeredParameterTypes(); // Set<string>

// Check if a type is supported
isParameterTypeRegistered("integer"); // true
```

### Collecting Types from Tools

```typescript
import { collectParameterTypes, collectValidatorTypes } from "@galaxy-tool-util/schema";

const paramTypes = collectParameterTypes(bundle); // Set<string>
const validatorTypes = collectValidatorTypes(bundle); // Set<string>
```

## Workflow Schemas

### Format2 Workflows

```typescript
import {
  NormalizedFormat2WorkflowSchema,
  normalizedFormat2,
  expandedFormat2,
} from "@galaxy-tool-util/schema";
import * as S from "effect/Schema";

// Parse and normalize a format2 workflow
const workflow = S.decodeUnknownSync(NormalizedFormat2WorkflowSchema)(rawYaml);

// Or use the normalization function directly
const normalized = normalizedFormat2(rawWorkflow);

// Expand external subworkflow references (async)
const expanded = await expandedFormat2(rawWorkflow, { resolver });
```

### Native Workflows

```typescript
import {
  NormalizedNativeWorkflowSchema,
  normalizedNative,
  expandedNative,
} from "@galaxy-tool-util/schema";

// Parse and normalize a native (.ga) workflow
const workflow = S.decodeUnknownSync(NormalizedNativeWorkflowSchema)(rawJson);

// Expand external subworkflow references
const expanded = await expandedNative(rawWorkflow, { resolver });
```

### Workflow Utility Functions

- `isTrsUrl(url)` — check if a string is a [TRS](https://ga4gh.github.io/tool-registry-service-schemas/) (Tool Registry Service) URL
- `injectConnectionsIntoState(step)` — merge connection info into step tool_state
- `flatStatePath(keys)` — flatten nested parameter path to a dot-separated string
- `scanForReplacements(state)` — find `${...}` replacement patterns in tool state
- `repeatInputsToArray(inputs)` — convert repeat block inputs to arrays
- `selectWhichWhen(inputs)` — resolve conditional parameter selections

## Draft Workflows

A _draft workflow_ (`class: GalaxyWorkflowDraft`) is an in-progress Format2 workflow carrying `TODO_<hint>` sentinels in place of unresolved tool ids, ports, and edges, plus optional `_plan_*` planning fields on individual steps. Drafts are the substrate for the `gxwf draft-*` CLI commands and for autonomous agents iterating a workflow toward runnable.

Schema definitions live in `raw/gxformat2-draft.{ts,effect.ts}`; pure-logic helpers live in `workflow/draft-checks.ts`.

### Sentinel constants

```typescript
import {
  TODO_SENTINEL_PATTERN,
  PLAN_FIELDS,
  DRAFT_CLASS,
  isTodoSentinel,
  isDraftWorkflow,
} from "@galaxy-tool-util/schema";

// Mirrors gxformat2/draft.py — drift is enforced by `make check-sync-draft-sentinel`.
TODO_SENTINEL_PATTERN; // /^TODO(_[a-z0-9_]+)?$/
PLAN_FIELDS; // ["_plan_state", "_plan_context", "_plan_in", "_plan_out"]
DRAFT_CLASS; // "GalaxyWorkflowDraft"

isTodoSentinel("TODO_input"); // true
isTodoSentinel("TODO-foo"); // false (malformed)
isDraftWorkflow({ class: DRAFT_CLASS }); // true
```

### `detectDraft(workflow): DraftSurvey`

One-pass step-focused survey collecting every TODO sentinel and `_plan_*` hit with its step path. Recurses into draft `run:` subworkflows; concrete (`class: GalaxyWorkflow`) and string-form `run:` are not descended.

### `validateDraft(workflow): DraftValidationResult`

Collects all draft diagnostics into structured arrays — does not throw. Pipeline: lax structural decode against `GalaxyWorkflowDraftSchema`, concrete-topology checks (workflow input/output/step labels and step types cannot be TODO sentinels; every `step/port` edge ref must resolve), sentinel-form checks (TODO-shaped strings that don't match the canonical pattern → semantic error), and warnings (bare `TODO` in port positions; top-level `_plan_*`).

### `nextDraftStep(workflow): NextStepResult`

Pure, idempotent function that picks the next step a downstream agent should work on. Topological walk with alphabetical tie-break; first step carrying any TODO or `_plan_*` is returned with a prompt-shaped `work[]` array in the locked-decision order (`tool_id → tool_version → in.* → out.* → _plan_state → _plan_context → _plan_in → _plan_out`). Subworkflow-aware: descends into draft `run:` blocks only after the outer step is itself fully concrete.

### `extractConcreteSubset(workflow): ExtractResult`

Trims a draft workflow down to the subset that could plausibly run. Fixpoint loop: round 0 drops every step carrying a TODO sentinel or `_plan_*`; cascade rounds drop any step whose `in:` becomes dead (all source refs point at dropped steps / now-missing inner-subworkflow ports, with no `default:` fallback). Multi-source step inputs where some refs survive are rewritten in place to the surviving subset. Step inputs with both `source:` and `default:` that lose their source keep the entry (default fallback) — no cascade. Workflow outputs whose `outputSource` references a dropped step / dead port are dropped. Recurses into inline draft subworkflows; outer subworkflow steps are never shrunk in v1. The returned workflow always carries `class: GalaxyWorkflowDraft` — promotion to concrete + `_plan_*` strip live in the `clean` module (CLI command E).

```typescript
import { extractConcreteSubset } from "@galaxy-tool-util/schema";

const { workflow, dropped_steps, dropped_outputs, rewritten_step_inputs } =
  extractConcreteSubset(draft);
```
