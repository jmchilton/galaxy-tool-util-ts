# Parameter Schema System

## Overview

[Galaxy](https://galaxyproject.org) tools define their parameters in XML (`<inputs>` section). When a tool is fetched from the [ToolShed](https://toolshed.g2.bx.psu.edu), these definitions are parsed into a `ToolParameterModel[]` array. The schema package converts these models into [Effect Schemas](https://effect.website/docs/schema/introduction) that can validate parameter values.

## Pipeline

```
Tool XML (on ToolShed)
  → ToolShed TRS API → ParsedTool.inputs (ToolParameterModel[])
  → ToolParameterBundleModel { parameters }
  → createFieldModel(bundle, stateRep)
  → Effect Schema (S.Struct with typed fields)
```

## Generator Registry

Each Galaxy parameter type (integer, float, text, select, data, conditional, repeat, etc.) has a registered generator function:

```typescript
type ParameterSchemaGenerator = (
  param: ToolParameterModel,
  stateRep: StateRepresentation,
  ctx: GeneratorContext,
) => DynamicSchemaInfo;
```

Generators are registered in a global registry. `createFieldModel` looks up each parameter's type, calls its generator, and assembles the results into a struct.

### DynamicSchemaInfo

Each generator returns:

```typescript
interface DynamicSchemaInfo {
  name: string;                    // Field name in the struct
  schema: S.Schema.Any;           // The Effect Schema for this field
  isOptional: boolean;            // Whether the field is optional
  alias?: string;                 // Key alias (for _-prefixed parameter names)
  connectedValueHandled?: boolean; // Whether ConnectedValue wrapping was already applied
}
```

### GeneratorContext

Container types (conditional, repeat, section) need to recursively build schemas for their children. The `GeneratorContext` provides methods for this without circular imports:

```typescript
interface GeneratorContext {
  buildChildSchema(params, stateRep): S.Schema.Any | undefined;
  buildChildSchemaInfos(params, stateRep): DynamicSchemaInfo[] | undefined;
  assembleStruct(infos): S.Schema.Any;
}
```

## State Representation Effects

The [state representation](glossary#state-representations) controls several schema behaviors:

| Behavior | Affected Representations |
|---|---|
| All fields optional | `workflow_step`, `workflow_step_linked`, `workflow_step_native`, `landing_request`, `landing_request_internal` |
| All fields required | `job_internal`, `job_runtime` |
| [ConnectedValue](glossary#connected-value) allowed | `workflow_step_linked` |
| ConnectedValue + [RuntimeValue](glossary#runtime-value) allowed | `workflow_step_native` |
| String-encoded IDs | `request`, `relaxed_request`, `landing_request` |
| Integer IDs | `request_internal`, `request_internal_dereferenced`, `landing_request_internal`, `job_internal` |
| Batching (list values) | `request`, `relaxed_request`, `request_internal`, `request_internal_dereferenced`, `landing_request`, `landing_request_internal` |

## Adding a New Parameter Type

1. Create a generator function in `packages/schema/src/schema/parameters/`
2. Register it in the registry (`packages/schema/src/schema/parameters/registry.ts`)
3. Add test cases to the parameter spec tests

The generator receives the full `ToolParameterModel` and state representation, so it has access to all attributes (min, max, options, etc.) to build an appropriately constrained schema.

## Schema Sources

The `schema-sources/` directory contains upstream YAML definitions from [gxformat2](https://github.com/galaxyproject/gxformat2) (synced via `make sync-schema-sources`). These define the workflow schema structure — not parameter types. Parameter type generators are hand-written in TypeScript.
