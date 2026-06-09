---
"@galaxy-tool-util/schema": patch
---

Emit format2 YAML with the `yaml-1.1` schema so reserved words quote. `serializeWorkflow` previously stringified with the default core (1.2) schema, leaving word-form booleans (`no`/`yes`/`on`/`off`) bare; a YAML 1.1 reader (e.g. Galaxy's PyYAML) then coerced them to booleans, corrupting string tool_state values like a select's `"no"`. Real numbers and booleans are unaffected.
