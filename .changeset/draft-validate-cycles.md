---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

`validateDraft` now reports steps that form a dependency cycle, including a step sourcing its own output, as a topology error, so `gxwf draft-validate` rejects cyclic drafts. Each error names a group of steps that depend on each other through a cycle, not steps merely downstream of one.
