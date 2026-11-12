---
"@galaxy-tool-util/cli": patch
---

Fail a step whose `when:` expression reads an input the step does not have.

Galaxy evaluates `when:` against the step's tool parameters plus its own input names; any other `inputs.<name>` is `undefined`, so a guard like `$(inputs.input_layout == 'single')` with no `input_layout` is constant and the step is always skipped (or always runs). `gxwf validate`, `lint`, `draft-validate --concrete` and `validate-tree` (and gxwf-web, which uses the same validators) now report `when expression reads inputs.<name>, but the step has no input or tool parameter "<name>"` on both the `state` and `tool_state` paths, in both the Effect and JSON-Schema validators. Dynamic access (`inputs[expr]`, template literals) is not checked.
