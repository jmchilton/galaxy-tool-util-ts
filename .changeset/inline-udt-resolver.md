---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/connection-validation": minor
"@galaxy-tool-util/core": patch
---

Inline UDT resolver for connection validation (jmchilton/galaxy-tool-util-ts#101). Also refreshes the parsed_tools/ fixture cache to pick up new ParsedTool fields (`requirements`, `containers`, `stdio`) added upstream — incidental to this PR; the TS-side `ParsedTool` schema ignores them. TS port of Galaxy's `_inline_tool` module on the `wf_tool_state` branch: `@galaxy-tool-util/schema` now ships `parseInlineTool(repr)` (full port of `parse_tool(YamlToolSource(repr))` covering id/version/name/description, inputs, outputs, citations, license, profile, edam, xrefs, help). `@galaxy-tool-util/connection-validation` ships `resolveForStep`, `InlineResolver`, `ensureInlineResolver`, and `collectInlineTools`; `buildWorkflowGraph` wraps its resolver in an `InlineResolver` so inline `tool_representation` steps (with `class: GalaxyUserTool`) resolve without a remote lookup. `buildGetToolInfo` walks inline reps up-front and pre-parses them into the cache, surfacing parse errors via `onMiss` alongside ToolShed misses. Unblocks UDT fixtures in the connection-validation corpus (eight new fixtures pulled byte-identical from Galaxy's `wf_tool_state` branch).
