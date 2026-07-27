---
"@galaxy-tool-util/tool-xml": minor
---

Add the public `parseXmlTool(text, resolver)` / `loadXmlTool(path)` entry — the TS mirror of Python `parse_tool(get_tool_source(path))`. Assembles the `ParsedTool` fields off an `XmlToolSource` and decodes them through the `ParsedTool` schema, so a non-tool root (`<toolbox>`, …) is rejected exactly as Python's model rejects it. Extends the declarative cross-language corpus with Galaxy's `errors.yml` (parse-rejects-non-tool-xml).
