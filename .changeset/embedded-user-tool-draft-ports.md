---
"@galaxy-tool-util/schema": patch
---

Resolve draft edge refs against an embedded user-defined tool's outputs.

`validateDraft` and `extractConcreteSubset` only knew a step's ports from its `out:` block. For a step embedding a `GalaxyUserTool`, `out:` is optional — Galaxy creates every output the tool defines — so `draft-validate` reported "unknown port" for a workflow output sourced from the tool, and `draft-extract` silently dropped that output along with any step consuming it. The embedded tool's `outputs[].name` now count as the step's ports.
