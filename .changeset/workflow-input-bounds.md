---
"@galaxy-tool-util/schema": patch
---

Preserve numeric Format 2 workflow input `min` and `max` through native conversion. Store bounds as Galaxy `in_range` validators on import and recover them from non-negated validators on export.
