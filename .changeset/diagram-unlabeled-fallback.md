---
"@galaxy-tool-util/schema": patch
---

Fix mermaid + cytoscape diagram step labels for unlabeled native (`.ga`)
steps. The native→format2 normalizer assigns synthetic ids of the form
`_unlabeled_step_<n>` to steps without a label, which the diagram builders
were rendering verbatim instead of falling through to the `tool:<tool_id>`
display fallback. `workflowToMermaid` and `cytoscapeElements` now skip
unlabeled-prefix step ids when computing the visible label, matching the
documented `label || id || tool:tool_id || index` chain.
