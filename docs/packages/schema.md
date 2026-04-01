# @galaxy-tool-util/schema

Effect Schema definitions for Galaxy parameter types and workflow models. This is the core validation engine — it takes a tool's parameter definitions and produces typed schemas that can validate tool state and export to JSON Schema.

## Parameter Schemas

### `createFieldModel(bundle, stateRepresentation)`

The main entry point. Takes a tool's parameter bundle and a state representation, returns an Effect Schema that validates tool state for that representation.

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

| Representation | Description |
|---|---|
| `workflow_step` | Workflow editor step state — all fields optional, no connected values |
| `workflow_step_linked` | Workflow step with connections — parameters can be `ConnectedValue` markers |
| `workflow_step_native` | Native (.ga) workflow state — parameters can be `ConnectedValue` or `RuntimeValue` |
| `request` | API request with string-encoded IDs |
| `request_internal` | Internal request with integer IDs |
| `request_internal_dereferenced` | Dereferenced internal request |
| `relaxed_request` | Relaxed API request |
| `landing_request` | Landing page request (all optional) |
| `landing_request_internal` | Internal landing request (all optional) |
| `job_internal` | Job execution state — all fields required |
| `job_runtime` | Job runtime state — all fields required |
| `test_case_xml` | Test case from XML definition |
| `test_case_json` | Test case from JSON definition |

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

- `isTrsUrl(url)` — check if a string is a TRS (Tool Registry Service) URL
- `injectConnectionsIntoState(step)` — merge connection info into step tool_state
- `flatStatePath(keys)` — flatten nested parameter path to a dot-separated string
- `scanForReplacements(state)` — find `${...}` replacement patterns in tool state
- `repeatInputsToArray(inputs)` — convert repeat block inputs to arrays
- `selectWhichWhen(inputs)` — resolve conditional parameter selections
