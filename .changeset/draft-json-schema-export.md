---
"@galaxy-tool-util/schema": minor
---

Export `galaxyWorkflowDraftJsonSchema` — a plain JSON-Schema (2020-12) sibling of `GalaxyWorkflowDraftSchema`. Effect schema values are functions and do not survive `JSON.stringify`; the new export lets downstream packagers (e.g. Foundry's cast pipeline) bundle the draft schema verbatim. Closes #108.
