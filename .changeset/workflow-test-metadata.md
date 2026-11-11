---
"@galaxy-tool-util/cli": minor
"@galaxy-tool-util/connection-validation": minor
"@galaxy-tool-util/schema": minor
---

`validate-tests --workflow` and `validate-tests-tree --auto-workflow` now check collection shapes and datatypes (#210). Errors: `class: File` on a collection input, a collection type the input neither accepts nor maps over, and on output assertions dataset vs collection form, `collection_type`, and `ftype` against the output's fixed format. Warnings: a collection that maps the workflow over an input (that test's output checks are skipped), and a `filetype` outside the input's declared `format` or unknown to Galaxy, checked against the bundled usegalaxy.org datatypes snapshot or `--datatypes <file>`. Output shapes and formats resolve through the connection graph, reading tool steps from the local cache (`--cache-dir`). `TestFormatDiagnostic` gains an optional `severity`, and both reports gain `warnings`. connection-validation adds `resolveWorkflowOutputs`; an explicit `collection_type: null` on a collection input no longer defaults to `list`, and outputs of a subworkflow step without connections now resolve.
