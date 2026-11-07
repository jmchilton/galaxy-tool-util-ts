---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
"@galaxy-tool-util/connection-validation": patch
---

`gxwf draft-validate --concrete --json` adds a top-level `concrete_errors` array, so `ok: false` can always be explained from the top level. Step validation results in `gxwf validate`, `validate-tree`, `lint`, `lint-tree` and `draft-validate` reports gain an optional `label`, which names a step the same way in `connection_report`. Steps inside a labelled subworkflow report a path such as `outer/inner`, using the step's numeric id (`outer/2`) when it has no label. A step with `label: ""` now counts as unlabelled in `connection_report`.
