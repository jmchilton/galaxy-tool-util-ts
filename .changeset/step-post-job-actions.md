---
"@galaxy-tool-util/schema": minor
---

Propagate step-level `post_job_actions:` through Format2 → native (mirrors gxformat2 #210). Explicit PJAs merge alongside (and win key collisions over) `out:`-shorthand-derived entries. Action types without an `output_name` (e.g. `ValidateOutputsAction`) now round-trip instead of being silently dropped. Native `output_name` becomes optional via schema regen.
