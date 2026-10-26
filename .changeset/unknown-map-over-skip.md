---
"@galaxy-tool-util/connection-validation": patch
---

Treat a step's map-over as unknown when any of its edges is skipped, so downstream edges skip instead of reporting false `invalid` errors (#204).
