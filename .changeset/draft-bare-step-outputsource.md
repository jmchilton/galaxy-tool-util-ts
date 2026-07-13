---
"@galaxy-tool-util/schema": patch
---

Fix draft-workflow tooling rejecting/mishandling the gxformat2 bare-step
`outputSource`/`source` shorthand (`<step>`, resolving to `<step>/output`) that
`validate` and Galaxy accept. `draft-validate` now parses source refs through
the shared `resolveSourceReference` used by the concrete conversion path, and
`draft-next-step` / `draft-extract` resolve bare-step refs consistently — so
topological ordering, cascade-dropping, and output trimming all treat a bare
`<step>` as a step edge instead of a workflow input. The "unmatched" validation
error also no longer misreports a step reference as a workflow input.
