---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

`gxwf draft-validate --concrete --json` adds a top-level `concrete_errors` array, so `ok: false` can always be explained from the top level. Step validation results in `gxwf validate`, `validate-tree`, `lint` and `draft-validate` reports gain an optional `label`, which names a step the same way in `connection_report`.
