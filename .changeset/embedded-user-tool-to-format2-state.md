---
"@galaxy-tool-util/schema": patch
---

Keep a user-defined tool step's `tool_state`, `when`, `uuid` and `errors` when converting native to format2.

`toFormat2` emitted a native step carrying a `GalaxyUserTool` `tool_representation` as a format2 `run:` step with only its label, connections, outputs and position, dropping the step's parameter values and conditional. `gxwf roundtrip` reported the loss as a real diff. The `tool_state` now passes through verbatim, as it does for a cache-referenced tool without the stateful encoder.
