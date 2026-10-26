---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

Add `gxwf fill-defaults` for optional expansion of static tool-state defaults in native and format2 workflows. Preserve connected inputs with the new `connectedPaths` option on `expandToolStateDefaults`, including repeat instances introduced by connections. Strict validation continues to accept omitted conditional selectors with tool-defined defaults.
