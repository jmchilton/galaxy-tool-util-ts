---
"@galaxy-tool-util/schema": patch
---

Dispatch the `Tests` output-assertion and collection-element unions via a `class` discriminator (`if/then/else`) in the generated test-format JSON Schema. Galaxy's Pydantic model uses callable `Discriminator` functions that don't serialize to JSON Schema, so `model_json_schema()` degraded them to a plain `oneOf` and `validateTestsFile` wrongly accepted class-less collection assertions. The sync script now rewrites those unions so ajv matches the Pydantic runtime.
