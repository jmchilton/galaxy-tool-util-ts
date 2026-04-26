# @galaxy-tool-util/connection-validation

Connection validator for Galaxy workflows. Mirrors
`lib/galaxy/tool_util/workflow_state/connection_validation.py`.

Given a normalized native gxformat2 workflow and a `ParsedTool` lookup, walks
the workflow graph in topological order, validates each connection against
collection-type algebra (data ↔ collection, map-over, multi-data reduction),
and produces a structured report whose snake_case keys match Galaxy's
`ConnectionValidationReport` Pydantic model verbatim.

Parameter connections (`gx_text`, `gx_integer`, …) are not validated — Galaxy
parity. Connections referencing tools that the supplied `getToolInfo` cannot
resolve are skipped (status `"skip"`) with an explanatory error.
