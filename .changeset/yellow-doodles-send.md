---
"@galaxy-tool-util/schema": minor
---

`validateDraft` now flags `_plan_*` fields on a fully-resolved tool step as
a semantic error. Non-tool steps (subworkflow / pause / pick_value) keep
the v1 carve-out — `_plan_*` is allowed there. Closes the gap where the
locked metaplan decision was operationally enforced only by
`extractConcreteSubset`'s drop; the validate-time contract now matches.
