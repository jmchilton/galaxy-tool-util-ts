---
"@galaxy-tool-util/schema": patch
---

fix: deduplicate `galaxyWorkflowDraftJsonSchema` via `$defs`/`$ref`

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
