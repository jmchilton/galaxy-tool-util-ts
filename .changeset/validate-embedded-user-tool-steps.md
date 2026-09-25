---
"@galaxy-tool-util/cli": minor
---

Validate tool state of steps that embed a user-defined tool.

`gxwf validate` (both `--mode effect` and `--mode json-schema`), `gxwf lint` and `gxwf draft-validate --concrete` now validate a step with a format2 `run: {class: GalaxyUserTool}` or a native `tool_representation` against the parameters of the embedded definition — no tool cache needed. Previously the format2 form crashed and the native form was silently left out of the results. A definition that doesn't parse fails the step; a `tool_representation` of any other class (e.g. an admin-installed `GalaxyTool`) is reported as skipped, so `--strict-state` rejects it.
