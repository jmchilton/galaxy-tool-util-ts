---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

`gxwf validate --strict-state` now rejects tool steps with a reachable conditional missing its test parameter (Galaxy's import raises `KeyError` on these). New `gxwf fill-defaults` fills section, conditional and leaf defaults from tool definitions, leaving connected inputs absent. Schema exports `findMissingConditionalTests`; `expandToolStateDefaults` accepts `connectedPaths`.
