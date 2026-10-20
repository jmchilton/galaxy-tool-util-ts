---
"@galaxy-tool-util/schema": patch
"@galaxy-tool-util/cli": patch
---

Resync `tests.schema.json` from Galaxy `dev`. Nested collection element
assertions now accept `count`, `min`, and `max` (galaxy#23554, Galaxy ≥ 26.1),
so `gxwf validate-tests` no longer rejects them. Output and dataset element
assertions also gain `visible` (Galaxy ≥ 26.2).
