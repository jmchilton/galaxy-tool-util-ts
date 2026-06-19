---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

feat(cytoscape): render draft workflows with a planned/concrete visual distinction

`cytoscapeElements` now accepts `GalaxyWorkflowDraft` documents first-class,
the cytoscape sibling of the mermaid draft support. It consumes the shared
`resolveDraftOverlay` / `DraftOverlay` / `PLANNED_CLASS` / `stepRenderIdentity`
abstractions: planned nodes gain a `planned` class (appended after
`type_*`/`runnable`) plus `data.planned` and structured `data.plan_reason`
(`{ todos, plan_fields }`) for viewer tooltips; edges touching a planned step
or a `TODO_*` port gain `planned`, coexisting with any `mapover_*`/`reduction`
class. Concrete workflows render byte-for-byte as before. Detection is
automatic — a draft "just works"; pass `draftOverlay: null` (CLI
`gxwf cytoscapejs --no-draft-overlay`) to force plain output.

New export: `CytoscapePlanReason`. The bundled HTML stylesheet is unchanged
(it syncs from upstream gxformat2); the `planned` CSS treatment lands there
once the upstream template gains it.
