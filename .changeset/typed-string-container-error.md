---
"@galaxy-tool-util/schema": patch
---

fix(schema): emit a located diagnostic instead of throwing on a string-valued container parameter

The schema-aware walker rejects a scalar where a container parameter
(`gx_section`/`gx_repeat`/`gx_conditional`) is expected. It now throws a typed
`StringContainerError` carrying the offending parameter's flat state path and
container type, instead of a bare `Error` whose only structured data lived in
the English message — mirroring the existing `UnknownKeyError`.

The tool-state validators whose contract is to _return_ diagnostics
(`validateFormat2StepStateStrict`, `ToolStateValidator.validateNativeStep` /
`validateFormat2Step`) now catch `StringContainerError` and map it to a located
`ToolStateDiagnostic` (dot-separated path), so one malformed step no longer
crashes the whole validation pass. Conversion paths still throw, and the error
message is unchanged so existing `message.includes("legacy parameter encoding")`
consumers keep working.
