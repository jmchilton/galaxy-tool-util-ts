# How galaxy-tool-util Works

## The Big Picture

[Galaxy](https://galaxyproject.org) tools declare their parameters in XML. When you need to validate those parameters — whether for an API request, a workflow step, or a job — the valid shape of each parameter depends on *where* the data is being used. galaxy-tool-util fetches tool definitions, caches them locally, and generates typed schemas that encode these context-specific rules.

The core data flow:

```
ToolShed / Galaxy API  →  ParsedTool  →  ToolCache  →  Effect Schema  →  Validation / JSON Schema
```

1. **Fetch** — tool metadata is retrieved from a [ToolShed](https://toolshed.g2.bx.psu.edu) or Galaxy server via their TRS/API endpoints
2. **Parse** — the raw response is normalized into a **ParsedTool**, a structured model of the tool's inputs, outputs, and metadata
3. **Cache** — the ParsedTool is stored in a two-layer cache (memory + filesystem) so subsequent lookups never require the network
4. **Generate** — `createFieldModel(bundle, stateRep)` transforms the tool's parameter definitions into an [Effect Schema](https://effect.website/docs/schema/introduction), parameterized by a **state representation**
5. **Use** — the schema can validate data at runtime (`S.decodeUnknown`) or be exported as [JSON Schema](https://json-schema.org) (`JSONSchema.make`) for external consumers

## Key Concepts

### ParsedTool

A ParsedTool is the normalized model of a Galaxy tool after fetching. It contains the tool's parameter definitions (as `ToolParameterModel[]`), name, version, and metadata. ParsedTool instances are what the cache stores and what schema generation consumes. Defined in `@galaxy-tool-util/core`.

### State Representations

Galaxy tool parameters don't have a single valid shape — the same tool's parameters look different depending on context. A **state representation** names that context and controls how schemas are generated.

**Why do multiple representations exist?** Consider a dataset input parameter. When a user submits an API request, they provide a string-encoded dataset ID. Internally, Galaxy resolves that to an integer ID. In a workflow step, the parameter might not be set at all (it's optional), or it might be connected to another step's output (replaced with a `ConnectedValue` marker). Each of these contexts has different validation rules for the same parameter.

The representations you'll encounter most often:

| Representation | When you'd use it |
|---|---|
| `request` | Validating what a client sends to Galaxy's API — string IDs, batching allowed |
| `request_internal` | After Galaxy resolves string IDs to integers — same structure, different ID format |
| `workflow_step` | Parameters stored inside a workflow definition — all fields are optional |
| `workflow_step_linked` | Like `workflow_step`, but connected inputs appear as `ConnectedValue` markers |
| `workflow_step_native` | Like `workflow_step_linked`, plus `RuntimeValue` markers for user-supplied-at-runtime parameters |
| `job_internal` | Fully resolved state for a running job — all fields required, integer IDs |
| `test_case_xml` / `test_case_json` | Tool test case parameters |

See the [Parameter Schema System](architecture/parameter-schemas.md) for the complete list and the rules each representation applies.

### ConnectedValue and RuntimeValue

In workflow steps, not every parameter has a literal value:

- A **ConnectedValue** (`{"__class__": "ConnectedValue"}`) means the parameter's value comes from a connection to another step's output. Valid in `workflow_step_linked` and `workflow_step_native`.
- A **RuntimeValue** (`{"__class__": "RuntimeValue"}`) means the parameter will be supplied when the workflow is invoked, not fixed in the definition. Valid only in `workflow_step_native`.

The schema system wraps parameter schemas with union types to allow these markers where appropriate.

### Tool State

Tool state is the JSON object inside a workflow step that holds parameter values for a tool invocation. Its shape depends on the state representation. "Stale" tool state occurs when a workflow references an older tool version whose parameters have changed — `gxwf validate` detects this.

## Why Effect Schema?

This project uses [Effect Schema](https://effect.website/docs/schema/introduction) as its core schema representation because a single definition serves two purposes: runtime validation and JSON Schema export. Galaxy's parameter model is complex — unions, recursive structures (conditionals, repeats), context-dependent optionality — and Effect Schema handles all of these compositionally.

For patterns and examples, see [Effect Schema Usage](architecture/effect-schema.md).

## Package Structure

```
schema (no internal deps)
  ↑
core (depends on: schema)
  ↑
cli (depends on: core, schema)
tool-cache-proxy (depends on: core, schema)
```

- **`@galaxy-tool-util/schema`** — Effect Schema definitions for tool parameters and workflow formats. The foundation layer.
- **`@galaxy-tool-util/core`** — ParsedTool model, ToolCache, ToolInfoService, and API clients for fetching from ToolShed/Galaxy.
- **`@galaxy-tool-util/cli`** — `galaxy-tool-cache` (cache management) and `gxwf` (workflow operations) command-line tools.
- **`@galaxy-tool-util/tool-cache-proxy`** — HTTP server that mirrors ToolShed API endpoints using locally cached data, so workflow editors can resolve tools without network access.

## Workflow Operations

Beyond tool parameter validation, the schema package also handles Galaxy workflow files (both native `.ga` and format2 `.gxwf.yml`):

```
Workflow file → detectFormat() → validate / clean / lint / convert
```

- **validate** — expand subworkflow references, then validate each step's tool state against the appropriate schema
- **clean** — remove stale keys and legacy encodings
- **lint** — check best practices and report issues
- **convert** — transform between native and format2 formats

Tree variants (`discoverWorkflows` + `collectTree`) apply these operations across an entire directory of workflows.
