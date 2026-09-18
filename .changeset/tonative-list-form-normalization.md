---
"@galaxy-tool-util/schema": patch
---

Always normalize in `toNative`, fixing `TypeError: step.in is not iterable` on list-form Format2 workflows.

`toNative` decided a workflow was already normalized from three top-level facts — `class: GalaxyWorkflow` plus array-valued `inputs` and `steps` — none of which constrain the per-step shape. gxformat2 allows list-form `inputs`/`steps` alongside dict-form `in`/`out`, and such a workflow skipped `normalizedFormat2` entirely and then crashed in `_extractConnections`. `gxwf validate --connections`, `gxwf convert --to native` and `ensureNative` were all affected. `normalizedFormat2` is idempotent, so the shape check is dropped and normalization now runs unconditionally.
