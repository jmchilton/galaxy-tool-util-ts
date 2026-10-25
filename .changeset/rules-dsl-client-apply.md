---
"@galaxy-tool-util/workflow-graph": minor
---

Add the Galaxy client's `applyRules` and `colHeadersFor` to the rules DSL (column tracking, per-rule `error`/`warn`, upload metadata columns) so Galaxy's rule builder can consume them. Python expressions now go through `pyre-to-regexp`, as in Galaxy's client; it is the package's first runtime dependency.
