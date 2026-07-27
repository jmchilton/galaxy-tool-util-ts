---
"@galaxy-tool-util/tool-xml": minor
"@galaxy-tool-util/schema": minor
---

Add a declarative tool-parsing test harness (`@galaxy-tool-util/tool-xml`) that asserts the SAME YAML expectation files and functional-tool fixtures on the TS parser as Galaxy's Python `parse_tool` — so the two paths cannot silently drift. Fixtures + expectations are scoped to the metadata/inputs/outputs cases the TS parser covers and synced via a new `tool-parsing` fixture group (`make sync-tool-parsing`).

To back the YAML fixtures, `@galaxy-tool-util/schema` gains `parseYamlTool(repr)` — a decoded-YAML-tool → `ParsedTool` parser handling both the legacy `GalaxyTool` and user-facing `GalaxyUserTool` classes (reusing the existing input/output trees). `parseInlineTool` becomes a thin `GalaxyUserTool`-guarded wrapper over it.
