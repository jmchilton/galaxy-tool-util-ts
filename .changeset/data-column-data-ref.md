---
"@galaxy-tool-util/schema": minor
---

Carry `data_ref` on data_column parameters. `DataColumnParameterModel` now has a `data_ref: string | null` field (the referenced data input), and the input factory populates it from the source — closing a gap against Galaxy's `DataColumnParameterModel`, which has carried `data_ref` all along. Works for both the XML and inline/YAML paths.
