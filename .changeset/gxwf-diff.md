---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

Add `diffWorkflows` / `renderWorkflowDiff` and the `gxwf diff BEFORE AFTER [--json] [--exit-code]` command: a structural diff of two Format2 workflows (either may be a draft), ported from gxformat2's `gxwf-diff`. List-form workflow inputs now resolve input type aliases (`File` → `data`) during normalization, as dict-form inputs already did. A `gxwf` command given a missing or unreadable workflow file now prints one `Failed to read <path>: <reason>` line instead of an unhandled stack trace and exits as it does for a parse failure: 2 for `draft-validate`, `draft-extract` and `draft-next-step` (before, 1), 1 for the others.
