---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

`validateDraft` now reports steps that form a dependency cycle, including a step sourcing its own output, as a topology error, so `gxwf draft-validate` rejects cyclic drafts. One error per cycle names only the steps on it.
