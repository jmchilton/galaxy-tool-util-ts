---
"@galaxy-tool-util/schema": patch
"@galaxy-tool-util/connection-validation": patch
"@galaxy-tool-util/cli": patch
---

Reject a Format2 source that names no step or input, such as a step named by its id (map key) when the step has a different `label`. Sources resolve by label, as in gxformat2.

- `toNative` and `gxwf convert` fail with `Cannot resolve '<source>': …` (`UnresolvedSourceError`) instead of writing `input_connections` with `id: null`. When the source names a labelled step by its id, the message gives the label to use.
- `gxwf validate --connections` (and `validateConnectionsReport`) reports the workflow invalid with that message, where it used to report `skip: NaN/<port>` and exit 0.
- `gxwf lint` reports it as a structural error for step input sources and workflow `outputSource`s. The `outputSource` check now resolves the same way conversion does, so a step label containing `/` (for example IWC atacseq's `Merge summits +/-500kb`) is no longer reported as missing, and a step named by its id is.

Numeric step ids still resolve, and the `runtime_value` placeholder from stateful conversion is unchanged.
