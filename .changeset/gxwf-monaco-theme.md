---
"@galaxy-tool-util/gxwf-ui": minor
---

Brand the embedded Monaco editor with first-class `gxwf-dark` and
`gxwf-light` color themes, contributed through a synthetic VS Code
extension. The active theme tracks the app's dark-mode toggle in real time
via the workbench configuration service — no page reload, no flash of the
default theme. Replaces the prior decorative `workbench.colorCustomizations`
layering with full theme JSON files (chrome + TextMate token rules) and
drops the `theme` prop from `MonacoEditor.vue`; the dark class on `<html>`
is the single source of truth.
