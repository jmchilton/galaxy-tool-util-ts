# Effect Schema Usage

## Why Effect Schema?

This project uses [Effect Schema](https://effect.website/docs/schema/introduction) rather than Zod, io-ts, or other validation libraries for several reasons:

- **Dual-purpose**: A single schema definition provides both runtime validation (`S.decodeUnknown`) and JSON Schema export (`JSONSchema.make`). No need to maintain parallel definitions.
- **Composable**: Effect Schema supports unions, intersections, property signatures with aliases, and recursive types — all needed for Galaxy's complex parameter models.
- **Effect ecosystem**: Integrates with Effect's error channel for structured error reporting.
- **Type inference**: Full TypeScript type inference from schema definitions via `S.Schema.Type<typeof MySchema>`.

## Patterns Used

### Struct definitions

```typescript
import * as S from "effect/Schema";

const ParsedTool = S.Struct({
  id: S.String,
  version: S.String,
  name: S.String,
  inputs: S.Array(S.Unknown),
});
```

### Optional fields with defaults

```typescript
const ServerConfig = S.Struct({
  port: S.optionalWith(S.Number, { default: () => 8080 }),
  host: S.optionalWith(S.String, { default: () => "127.0.0.1" }),
});
```

### Unions for variant types

```typescript
// ConnectedValue marker in workflow steps
const ConnectedValueSchema = S.Struct({
  __class__: S.Literal("ConnectedValue"),
});

// A parameter can be its normal type OR a ConnectedValue
const fieldSchema = S.Union(normalSchema, ConnectedValueSchema);
```

### Property signature aliases

Galaxy parameter names can start with `_`, which conflicts with some tooling. Aliases map between wire format and internal names:

```typescript
const field = S.propertySignature(schema).pipe(S.fromKey("_underscore_param"));
```

### JSON Schema export

```typescript
import * as JSONSchema from "effect/JSONSchema";

const effectSchema = createFieldModel(bundle, "workflow_step");
const jsonSchema = JSONSchema.make(effectSchema);
// Standard JSON Schema object, usable with Ajv or any JSON Schema validator
```

### Runtime validation

```typescript
import * as S from "effect/Schema";

// Sync (throws on failure)
const parsed = S.decodeUnknownSync(schema)(data);

// Either (no throw)
const result = S.decodeUnknownEither(schema)(data);

// Effect (for Effect pipelines)
const effect = S.decodeUnknown(schema)(data);
```

## Where It's Used

| Package | Usage |
|---|---|
| **schema** | Parameter type generators produce `S.Schema.Any`; workflow schemas defined as `S.Struct` |
| **core** | `ParsedTool`, `CacheIndex`, `ServerConfig` all defined as Effect Schemas |
| **tool-cache-proxy** | `ServerConfig` validated on load via `S.decodeUnknownSync`; JSON Schema served via `JSONSchema.make` |
| **cli** | Schema export command uses `JSONSchema.make`; Effect mode validation uses `S.decodeUnknown` |
