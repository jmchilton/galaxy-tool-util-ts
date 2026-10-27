---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/connection-validation": minor
"@galaxy-tool-util/cli": minor
---

`validate-tests --workflow` / `validate-tests-tree --auto-workflow` now check collection shape and datatype (#210): `class: File` on a collection input, input `collection_type` via the collection-type algebra, dataset vs collection form and `collection_type` on output assertions (output shapes resolved through the connection graph; `--cache-dir` for tool steps), and, as warnings, `filetype` outside the input's declared `format` and a collection mapping over an input (which skips that test's output shape checks). `TestFormatDiagnostic` gains optional `severity`; reports gain `warnings`. Adds `resolveWorkflowOutputCollectionTypes` and `WorkflowGraph.outputMap`.
