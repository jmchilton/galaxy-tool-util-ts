---
"@galaxy-tool-util/schema": minor
---

Pass embedded user-defined tools (`run:` with `class: GalaxyUserTool`) through format2 expansion.

`expandedFormat2` treated every object under a step's `run:` as a subworkflow and crashed with `wf.steps is not iterable` on an embedded tool, which took down `gxwf validate` and `gxwf draft-validate --concrete` for such workflows. Embedded tools now pass through unchanged, as gxformat2's `GalaxyUserToolStub` does. The normalized format2 step schema models the stub (`GalaxyUserToolStubSchema`), and `isGalaxyUserToolRun` tells an embedded tool from a subworkflow.
