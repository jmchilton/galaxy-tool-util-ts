---
"@galaxy-tool-util/tool-xml": minor
"@galaxy-tool-util/schema": minor
---

Add `XmlToolSource.parseOutputs()` — a port of Galaxy's `XmlToolSource.parse_outputs` + `output_objects.from_tool_source` that turns an expanded `<outputs>` tree into the `ToolOutput` union (data / collection / integer / float / boolean / text). Reproduces the subtle behaviors verified against Python: the collections-then-data-then-expression ordering, the legacy (16.01) default dataset collector, `auto_format` → `_sniff_`, pre-21.09 `from_work_dir` stripping, and collection `label` defaulting to `""`. `discover_datasets` translation reuses schema's descriptor parser, now exported as `parseDiscoverDatasets` (Galaxy shares that logic across the XML and YAML paths too). That shared parser also gains a fix: `discover_datasets` format now resolves `ext` before `format` (ext-first), matching Galaxy's `DatasetCollectionDescription` — this affects the existing YAML path only when a descriptor sets both.
