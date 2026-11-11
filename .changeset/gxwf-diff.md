---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

Add `diffWorkflows` / `renderWorkflowDiff` and the `gxwf diff BEFORE AFTER [--json] [--exit-code]` command: a structural diff of two Format2 workflows (either may be a draft), ported from gxformat2's `gxwf-diff`. List-form workflow inputs now resolve input type aliases (`File` → `data`) during normalization, as dict-form inputs already did.
