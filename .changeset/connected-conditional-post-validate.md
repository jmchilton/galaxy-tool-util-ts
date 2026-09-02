---
"@galaxy-tool-util/schema": patch
"@galaxy-tool-util/cli": patch
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

The same correction is applied everywhere the pattern appeared, so the workflow
actually round-trips end to end:

- `toNativeStateful` passes `nativeConnectionsFromFormat2In(step.in)` to both
  its pre- and post-validation hooks (the reverse leg previously failed
  `pre_validation` and fell back to schema-free passthrough).
- `gxwf validate` on format2 skips its bare `workflow_step` pass for steps that
  have connections, judging them on the connection-injected `workflow_step_linked`
  pass alone.
- `gxwf validate --mode json-schema` does the same: its Level-1 `workflow_step`
  pass is skipped for connected steps, so Level-2 linked validation is reached
  instead of being short-circuited by a spurious `must have required property`
  failure.

Turning the reverse leg back on exposed a second defect it had been masking:
`encodeStateToNative` wrote `undefined` back for every branch leaf the format2
state did not contain, so a leaf absent from an under-specified source workflow
reappeared as a key after a round-trip. Absent leaves are now skipped, matching
the forward direction.
