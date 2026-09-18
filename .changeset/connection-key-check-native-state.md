---
"@galaxy-tool-util/cli": patch
---

Report unmatched connection keys on steps that carry `tool_state`, not just `state`.

`gxwf validate` fails a step whose `in:` key names no parameter of the pinned tool — but only on the schema-aware `state` path. `_validateNativeState` made the same `injectConnectionsIntoState` call and discarded its return, so the unmatched keys were never reported and a stray connection validated green. Since `gxwf convert --to format2` emits `tool_state`, that covered essentially every converted workflow. Both the Effect and JSON-Schema validators now report the unmatched keys the same way on both paths.

A conditional step's skip-if expression is wired through the same `input_connections` map — under the literal key `when` natively, and under the names a format2 `when:` expression references — and names no tool parameter. Those keys are excluded from the report on both paths.
