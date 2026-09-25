---
"@galaxy-tool-util/schema": minor
---

Add `applyLayout` / `layoutPositions` (topological and layered strategies) and
`GRAPH_PROPERTY_CHECKERS`, porting gxformat2's layout module. Native
best-practice lint now checks step annotation, label, and untyped tool-state
parameters on native steps with native ids, matching gxformat2. Export
`unlabeledNodeId`.
