---
"@galaxy-tool-util/core": patch
"@galaxy-tool-util/search": patch
"@galaxy-tool-util/cli": patch
---

Keep `gxwf tool-search --enrich --json` stdout machine-readable when enrichment fails. Core and search services now expose optional diagnostic sinks and remain silent by default; the CLI sends those diagnostics to stderr. Expected Tool Shed pagination 404s no longer emit diagnostics.
