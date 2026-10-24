---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

Reject Format2 workflows missing `class: GalaxyWorkflow` at the root; inline `run:` subworkflows may still omit it (port of galaxyproject/gxformat2#278). Adds `withDecodeClass`.
