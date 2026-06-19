---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

feat(mermaid): render draft workflows with a planned/concrete visual distinction

`workflowToMermaid` now accepts `GalaxyWorkflowDraft` documents first-class.
A new pure `resolveDraftOverlay(raw)` classifies each step as planned (it
carries a TODO sentinel or a `_plan_*` field) and the builder marks planned
nodes with a dashed/muted `planned` class and dashes edges that touch a
planned step or a `TODO_*` port. Concrete workflows render byte-for-byte as
before. Detection is automatic — a draft "just works"; pass `draftOverlay:
null` (CLI `gxwf mermaid --no-draft-overlay`) to force plain output.

New exports from `@galaxy-tool-util/schema`: `resolveDraftOverlay`,
`DraftOverlay`, `DraftPlannedReason`, `PLANNED_CLASS`, and the shared
`stepRenderIdentity` / `rawStepRenderIdentity` helpers (the single identity
both the draft classifier and the visualizers key off, so overlay keys always
match the builders' node lookups). The structured `plannedReason` is carried
for the upcoming cytoscape consumer.
