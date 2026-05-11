---
"@galaxy-tool-util/schema": patch
---

`make generate-schemas` now pipes generator output through prettier so regenerated `raw/*.ts` files land prettier-conforming in the same step (no more separate post-sync `format-fix` commit).
