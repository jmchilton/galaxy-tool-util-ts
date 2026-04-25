---
"@galaxy-tool-util/gxwf-ui": patch
---

Set `activeEditor`, `resourceLangId`, and `editorIsOpen` context keys on Monaco mount so extension commands gated on those `when` clauses (Galaxy Workflows: Clean / Convert / Export / Insert Tool Step…) appear in the command palette.
