---
"@galaxy-tool-util/cli": minor
"@galaxy-tool-util/tool-xml": minor
---

Add `galaxy-tool-cache add-local <tool_path>` — parse a local tool file into a `ParsedTool` and cache it with `source: local`, the local-ingest counterpart to `add` (which fetches from the ToolShed). Dispatches on extension like Galaxy's `get_tool_source`: `.yml` → YAML tool, everything else → XML (CWL is not supported). Mirrors Galaxy's `galaxy-tool-cache add-local`: `--tool-id` (the full toolshed tool_id) is required for cache keying even when the file carries a bare id, which is surfaced only as a hint; `--tool-version` overrides the parsed version.

`@galaxy-tool-util/tool-xml` now exports `loadToolFile(path)` (extension-dispatching XML/YAML loader → `ParsedTool`) and `loadYamlTool(path)`.
