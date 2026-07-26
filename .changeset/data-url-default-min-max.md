---
"@galaxy-tool-util/schema": minor
---

Complete `DataParameterModel` against Galaxy's model: add `url_default`, `min`, and `max`. The input factory populates `url_default` from a `data` param's `<default location>` (via `parse_default`); `min`/`max` are present for shape parity but stay `null` (Galaxy's factory never reads them). Closes the remaining data-input field drift.
