---
"@galaxy-tool-util/schema": minor
---

Support Galaxy `color` and `directory_uri` workflow parameter inputs: model both, convert them between native and Format2 (keeping `directory_uri` regex validators), lint non-string defaults, draw them as Mermaid parameter nodes, and reject validators on `color`, restrictions/suggestions on either, and `multiple` on either (port of galaxyproject/gxformat2#281).
