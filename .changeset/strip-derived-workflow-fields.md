---
"@galaxy-tool-util/schema": patch
---

fix(schema): stop leaking derived in-memory fields into serialized workflows

`serializeWorkflow` now strips the normalization-only fields `unique_tools`
(workflow level) and `connected_paths` (step level) before emitting. These are
`Set`s built during normalization and never part of the on-disk Galaxy format;
serializing a `Set` produced a stray `{}` / empty mapping that downstream schema
validators (e.g. VS Code's Native Workflow Schema) reject. The strip walks the
workflow structurally — including native `subworkflow` and format2 `run` embeds —
so a tool parameter literally named `unique_tools`/`connected_paths` inside
`tool_state` is preserved. Fixes stray keys in `gxwf convert` output.
