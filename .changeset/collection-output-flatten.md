---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/tool-xml": minor
"@galaxy-tool-util/connection-validation": minor
---

Flatten collection outputs onto the output's top level (`collection_type`, `collection_type_source`, `collection_type_from_rules`, `structured_like`, `discover_datasets`), matching Galaxy's `tool_parsing_abstraction` model — no more `structure` wrapper on `ToolOutputCollection`. Both parsers (XML + inline/YAML) emit the flat shape, and `connection-validation` reads it flat.

`ParsedTool` decode stays **tolerant of both shapes**: a legacy nested `structure` (which current Galaxy releases still emit) is lifted to the top level on decode, so the port keeps decoding `ParsedTool` JSON from any Galaxy version; encode always emits flat. Connection-workflow goldens regenerated from `tool_parsing_abstraction`.
