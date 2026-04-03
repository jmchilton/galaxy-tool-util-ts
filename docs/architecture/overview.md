# Architecture Overview

## Monorepo Structure

```
galaxy-tool-util/
  packages/
    schema/    → Effect Schema definitions for parameters + workflows
    core/      → ToolCache, ToolInfoService, API clients
    cli/       → galaxy-tool-cache CLI (Commander.js)
    tool-cache-proxy/  → galaxy-tool-proxy HTTP server
  schema-sources/  → Upstream YAML definitions (synced from gxformat2)
```

## Package Dependencies

```
schema (no internal deps)
  ↑
core (depends on: schema via peer/dev)
  ↑
cli (depends on: core, schema)
tool-cache-proxy (depends on: core, schema)
```

`schema` is the foundation — it has no internal dependencies and defines the type system. `core` builds on it for caching and fetching. `cli` and `tool-cache-proxy` are consumers that provide different interfaces.

## Data Flow

```
ToolShed API / Galaxy API
        ↓
   fetchFromToolShed() / fetchFromGalaxy()
        ↓
   ParsedTool (normalized tool metadata)
        ↓
   ToolCache (filesystem + memory)
        ↓
   createFieldModel(bundle, stateRep)
        ↓
   Effect Schema (typed, composable)
        ↓
   JSONSchema.make()  or  S.decodeUnknown()
        ↓
   JSON Schema export    Runtime validation
```

## Key Design Decisions

**Effect Schema over Zod/io-ts**: Effect Schema provides both runtime validation and JSON Schema export from a single definition. It also integrates with the broader Effect ecosystem for error handling and composition. See [Effect Schema Usage](architecture/effect-schema.md).

**State representations**: Galaxy tool parameters have different valid shapes depending on context (API request vs workflow step vs job execution). Rather than one schema per tool, the system generates schemas parameterized by state representation. See [Parameter Schema System](architecture/parameter-schemas.md).

**Offline-first caching**: All tool metadata is cached to disk on first fetch. Subsequent operations never require network access. Cache keys are deterministic (ToolShed URL + TRS ID + version).

**ToolShed API compatibility**: The proxy server mirrors the ToolShed's TRS-based API paths, so clients that already speak ToolShed can point at the proxy with minimal changes.
