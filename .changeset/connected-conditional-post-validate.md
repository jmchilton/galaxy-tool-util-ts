---
"@galaxy-tool-util/schema": patch
"@galaxy-tool-util/cli": patch
---

fix(schema): align format2 state validation with Python's linked-state pipeline

A connection-supplied leaf lives in the format2 `in` block rather than `state`.
Validation now mirrors Galaxy's upstream Python pipeline: first validate the
stored state against `workflow_step`, where all fields are optional but present
values remain typed; then inject actual connections and always validate the
effective state against `workflow_step_linked`, which restores requiredness and
allows `ConnectedValue` to satisfy a required leaf. Unmatched connection paths
are rejected instead of silently discarded.

`StepRunnerConfig.postValidate` gains the original `args` so the converted
result can be checked against the step's `input_connections`.

The same correction is applied everywhere the pattern appeared, so the workflow
actually round-trips end to end:

- `toNativeStateful` passes `nativeConnectionsFromFormat2In(step.in)` to both
  its pre- and post-validation hooks (the reverse leg previously failed
  `pre_validation` and fell back to schema-free passthrough).
- `toFormat2Stateful` credits required runtime placeholders lifted into its
  synthetic `in` entries during the linked validation pass.
- `gxwf validate` and `gxwf validate --mode json-schema` both run the same
  unlinked-then-linked sequence, including for steps with zero connections.
- `ToolStateValidator` accepts a connection map for regular and strict format2
  validation, so API consumers get the same semantics as the CLI.

Turning the reverse leg back on exposed a second defect it had been masking:
`encodeStateToNative` wrote `undefined` back for every branch leaf the format2
state did not contain, so a leaf absent from an under-specified source workflow
reappeared as a key after a round-trip. Absent leaves are now skipped, matching
the forward direction.
