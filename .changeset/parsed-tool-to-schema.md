---
"@galaxy-tool-util/schema": minor
---

`ParsedTool` Effect Schema (plus `HelpContent`, `XrefDict`, `Citation`) now lives in `@galaxy-tool-util/schema` — it was moved from `@galaxy-tool-util/core`. This aligns package ownership: `schema` owns data models (parameter types, `ParsedTool`, workflow formats); `core` owns IO (`ToolInfoService`, `ToolCache`, HTTP clients).

`ParsedTool.inputs` is now typed as `readonly ToolParameterModel[]` instead of `readonly unknown[]`. Runtime decode behavior is unchanged (the underlying Effect Schema is a permissive object-guard; trusted-peer payloads are still accepted) — downstream consumers get compile-time typing without having to cast.

`ToolStateValidator` now accepts any `ToolInfoLookup` (`{ getToolInfo(toolId, toolVersion?) }`) instead of a concrete `ToolInfoService`. The `ToolInfoService` class in `@galaxy-tool-util/core` satisfies this interface structurally; no caller change required. This inverts the latent dependency — schema no longer needs a `@galaxy-tool-util/core` type import.

Additional leaf parameter-model types are now exported from the public index: `IntegerParameterModel`, `FloatParameterModel`, `TextParameterModel`.
