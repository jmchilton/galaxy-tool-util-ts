---
"@galaxy-tool-util/workflow-graph": minor
---

Split `canMatch` into `accepts` (asymmetric subtype check, edge validation)
and `compatible` (symmetric, sibling map-over checks). Mirrors the upstream
Galaxy split. The `sample_sheet` asymmetry guard now lives inside `accepts`
and `canMapOver` themselves rather than being deferred to caller-side
decision logic. `canMatchAny` renamed to `acceptsAny`.
