---
"@galaxy-tool-util/tool-xml": minor
"@galaxy-tool-util/schema": minor
---

Detect dynamic options for select and drill-down parameters. A select or drill-down whose options are computed at runtime — an XML `<param type="select">` with an `<options>` element (e.g. `from_data_table`) or either param with a `dynamic_options` code attribute — now yields `options: null` instead of an empty static list, matching Galaxy's factory. Adds `hasDynamicOptions()` / `hasDrillDownDynamicOptions()` to the `InputSource` seam (the inline/YAML source is always static, mirroring Galaxy's base); the XML source overrides them. `DrillDownParameterModel.options` is widened to nullable to carry the dynamic case; the drill-down default resolver and JSON-schema generator treat `null` as "any value, resolved at runtime."
