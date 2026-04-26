---
"@galaxy-tool-util/connection-validation": minor
"@galaxy-tool-util/cli": minor
---

New package `@galaxy-tool-util/connection-validation` — port of
`galaxy.tool_util.workflow_state.connection_validation`. Walks a typed
workflow graph in topological order, validates each connection against
collection-type algebra, and produces a snake_case
`ConnectionValidationReport` matching Galaxy's Pydantic shape verbatim.
All 26 connection-workflow fixtures + 19 sidecar `target/value`
expectations pass.

`gxwf validate --connections` runs the connection validator and attaches
the resulting report to the JSON output (`connection_report`). Mirrors
Python's opt-in `--connections` flag (default off).
