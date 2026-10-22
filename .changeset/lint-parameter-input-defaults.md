---
"@galaxy-tool-util/schema": patch
---

Lint multiple text/int/float input defaults and native parameter input defaults; name the input and expected type in default type errors. Treat native `tool_state` that isn't a JSON object as empty instead of crashing lint.
