---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

`validateUserToolSource` (and `gxwf validate-tool-source`) now checks the `inputs.*` member paths a user-defined tool's `shell_command` and `configfiles` expressions read against Galaxy's job runtime model, and the `$(inputs...)` references in output labels against what Galaxy fills in. `gxwf validate` and `draft-validate` fail embedded `GalaxyUserTool` steps with the same problems. A reference such as `inputs.reads.forward.path` on a `paired_or_unpaired` collection (it needs `inputs.reads.elements.forward.path`) no longer passes until the job fails (#212). The field lists come from Galaxy's models, synced with `make sync-job-runtime-schema`; `@galaxy-tool-util/schema` gains `acorn` as a dependency.
