---
"@galaxy-tool-util/search": patch
"@galaxy-tool-util/cli": patch
---

Route `gxwf tool-search` through `ToolSearchService` while preserving its starting-page, filtering, result-limit, enrichment, diagnostic, and exit-code behavior.
