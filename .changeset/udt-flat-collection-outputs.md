---
"@galaxy-tool-util/schema": patch
---

Resync the user-defined tool schema from Galaxy `release_26.1`. `validate-tool-source` now accepts flat collection outputs (`collection_type` and `discover_datasets` on the output, as Galaxy 26.1 requires) and `discover_datasets` entries with only `pattern`. Previously it demanded the pre-26.1 `structure:` form and all ten discovery fields.
