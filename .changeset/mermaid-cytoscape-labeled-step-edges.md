---
"@galaxy-tool-util/schema": patch
---

fix(diagram): render step→step edges into steps that carry an explicit label

The mermaid and cytoscape builders key step nodes by render identity
(`label || id`) but format2 `in:` sources address upstream steps by their dict
`id` (e.g. `drhip.in.meme_files: meme/meme_output`). When a step had a distinct
human `label:`, source resolution could not match the `id` reference, so every
step→step edge into that step was silently dropped — `workflowToMermaid` left
the downstream node orphaned and `cytoscapeElements` emitted a dangling edge to
a non-existent node id. Input→step edges were unaffected (inputs are referenced
by id and keyed by id), so diagrams looked deceptively sparse.

Both builders now index steps by their dict `id` as well as their render
identity and fold an `id`-form source reference back to that identity before
node lookup, preserving the planned/concrete draft-overlay styling on the
recovered edges.
