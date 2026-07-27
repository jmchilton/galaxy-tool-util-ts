---
"@galaxy-tool-util/tool-xml": minor
---

Build data_collection default values from XML. `XmlInputSource.parseDefault` now ports Galaxy's `parse_default`: a `<default>` child under a `data_collection` param is turned into a nested `{class: "Collection", name, collection_type, elements}` value, recursing through `<element>` (File) and nested `<collection>` (Collection) — so `DataCollectionParameterModel.value` matches Galaxy's factory. Absent `<default>` stays `null`. (The `data`-input `<default location>` → `url_default` case is a separate follow-up.)
