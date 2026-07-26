---
"@galaxy-tool-util/tool-xml": minor
"@galaxy-tool-util/schema": minor
---

Add the XML-backed input source (`XmlInputSource` / `XmlPageSource` in `@galaxy-tool-util/tool-xml`) — the port of Galaxy's `parser.xml.XmlInputSource` / `XmlPageSource`. It feeds the shared parameter-model factory through the `InputSource` seam, so `XmlToolSource.parseInputs()` builds the same `ToolParameterModel` union as the inline/YAML path.

Covered: leaf `<param>` types (numbers, text, boolean, color, data, data_column, select with static-option dedup by value, drill_down, and the other leaf kinds); the validators the factory keeps (`in_range`/`regex`/`length`/`expression`/`empty_field`/`no_options`, with `regex`/`expression` read from element text); `argument`-derived names; `data_column` `force_select`; `<repeat>`, `<section>`, and `<conditional>` containers — including boolean `<when>` discrimination through the test param's `truevalue`/`falsevalue`.

To support this, `@galaxy-tool-util/schema` now exports `inputModelsForPage` (build models for any `PageSource`), widens `InputType` with `"section"` and dispatches it in the factory (still returned only by the XML source — YAML sections stay unsupported), and improves boolean `<when>` discrimination for all sources. Also newly exported: `DataParameterModel` / `DataColumnParameterModel` / `DataCollectionParameterModel` / `DrillDownOption` / `ValidatorModel`. Dynamic options and nested-collection `<default>` construction land with later slices.
