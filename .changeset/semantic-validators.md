---
"@galaxy-tool-util/schema": minor
---

Add cross-field semantic validation for Format2 workflow inputs (mirrors gxformat2 #212 + #216). New `semantic-validators.ts` module rejects `restrictions:` / `suggestions:` / `restrictOnConnections:` on non-text inputs, `column_definitions:` on non-`sample_sheet` collections, column-default-vs-type mismatches, and `fields:` on non-record collection inputs. Wired into `validateFormat2` / `validateFormat2Strict`.
