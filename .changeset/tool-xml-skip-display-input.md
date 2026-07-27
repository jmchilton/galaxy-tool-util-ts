---
"@galaxy-tool-util/schema": patch
"@galaxy-tool-util/tool-xml": patch
---

Skip the `<display>` element in the input factory (data_source tools carry one alongside their params), matching `factory.input_models_for_page`. `XmlInputSource.parseInputType()` now returns the real `display` tag instead of collapsing it to `param`, and the container builders (repeat/section/when) route through `inputModelsForPage` so the skip applies uniformly. Fixes `parseXmlTool` throwing `Unknown Galaxy parameter type ''` on `test_data_source.xml` / `ucsc_tablebrowser.xml`; a parse sweep over Galaxy's 298 functional tools now matches Python `parse_tool` exactly.
