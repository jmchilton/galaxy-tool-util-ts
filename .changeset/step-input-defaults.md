---
"@galaxy-tool-util/schema": patch
---

Propagate Format2 step input defaults through `to_native` (mirrors gxformat2 #213). Tool and subworkflow steps now emit `step.in = {input: {default: ...}}` for each `WorkflowStepInput` with a non-null default.
