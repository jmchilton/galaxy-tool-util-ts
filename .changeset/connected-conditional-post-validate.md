---
"@galaxy-tool-util/schema": patch
---

fix(schema): credit connections in post-conversion format2 state validation

A connection-supplied leaf is stripped out of the converted format2 state
entirely — it moves to the `in` block, not `state`. When that leaf is
*required* by its parameter schema (a typed leaf with no default inside a
conditional branch, as in `iuc/compose_text_param`'s `float` case), the bare
`workflow_step` model rejected it as `component_value: is missing`, failing
round-trip conversion for the whole workflow with a misleading diagnostic.

`validateFormat2StepState` now mirrors the forward native path: when the step
has input connections it re-injects `ConnectedValue` markers and validates
against `workflow_step_linked`, whose leaves union `ConnectedValue`.
Connection-free steps keep the simpler `workflow_step` path. Type checking is
unaffected — a bad value on a non-connected parameter still fails.

`StepRunnerConfig.postValidate` gains the original `args` so the converted
result can be checked against the step's `input_connections`.
