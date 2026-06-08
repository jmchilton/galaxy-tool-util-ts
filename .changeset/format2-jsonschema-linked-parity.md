---
"@galaxy-tool-util/schema": patch
"@galaxy-tool-util/cli": patch
---

Fix format2 two-level JSON Schema validation to match Galaxy:

- A connected `multiple` select now validates against `workflow_step_linked`. `injectConnectionsIntoState` gained a `{ linked: true }` option that encodes the marker as a single-element list `[{ConnectedValue}]` (the linked select-multiple schema accepts ConnectedValue only as an array item, per `parameter_specification.yml`), instead of the bare `{ConnectedValue}` that the schema rejected.
- `validateFormat2StepsJsonSchema` no longer crashes (`"/schemas/unknown" resolves to more than one schema`) on tools with two or more unknown/any params — each schema compiles in its own ajv instance with `$id` stripped.
- Structural JSON Schema validation is non-strict (additional properties allowed) and unmatched connection keys (e.g. the `when` gate) are tolerated, matching Python's `validate_workflow_json_schema`.
