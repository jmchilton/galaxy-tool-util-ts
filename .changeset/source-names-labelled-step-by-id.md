---
"@galaxy-tool-util/schema": patch
"@galaxy-tool-util/connection-validation": patch
"@galaxy-tool-util/cli": patch
---

Reject a Format2 source that names no step or input, such as a step named by its id (map key) when the step has a different `label`. Sources resolve by label, as in gxformat2.

- `toNative` and `gxwf convert` fail with `Cannot resolve '<source>': …` (`UnresolvedSourceError`) instead of writing `input_connections` with `id: null`. When the source names a labelled step by its id, or an input by its label, the message says what to write instead. `toNative(wf, { unresolvedSources: "drop" })` leaves such connections out instead.
- `gxwf validate --connections` (and `validateConnections` / `validateConnectionsReport`) reports each such source as an error on the step holding it, naming the subworkflow when it is inside one, where it used to report `skip: NaN/<port>` and exit 0. `buildWorkflowGraph` leaves the edge out and lists the source in `unresolvedSources`, so `gxwf mermaid --annotate-connections`, the Cytoscape annotations and gxwf-web's edge annotations still draw the workflow.
- `gxwf lint` reports them as structural errors, for step input sources and workflow `outputSource`s, resolved the same way conversion resolves them (`unresolvedFormat2Sources`). So a step label containing `/` (for example IWC atacseq's `Merge summits +/-500kb`) is no longer reported as missing, while a step named by its id, or an input named by its `label` instead of its `id`, now is.

Numeric step ids still resolve. Stateful conversion's `runtime_value` placeholder keeps writing a `null` step id as before, unless an input or step really is named `runtime_value`.
