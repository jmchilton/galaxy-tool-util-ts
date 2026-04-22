# @galaxy-tool-util/workflow-graph

Pure collection-type algebra and datatype subtyping primitives extracted from Galaxy's workflow editor.

Consumed by:

- Galaxy (re-exported from `client/src/components/Workflow/Editor/modules/` and
  `client/src/components/Datatypes/`).
- The TypeScript workflow connection validator in this monorepo.
- Future tooling (CLI, VS Code plugin, gxwf-ui).

No runtime dependencies. Pure TypeScript / ESM.

See `TS_CONNECTION_REFACTOR_IN_GX_PLAN.md` and the `old/CONNECTION_VALIDATION.md`
historical note for context on why these primitives were extracted.
