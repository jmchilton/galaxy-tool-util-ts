/**
 * Parse a Galaxy inline `tool_representation` (class: `GalaxyUserTool`) into a
 * `ParsedTool` — the same shape Galaxy's `/api/tools/:id/parsed` endpoint and
 * ToolShed serve up. This is the TS port of Galaxy's
 * `parse_tool(YamlToolSource(repr))` path; it covers the fields included in
 * the TS `ParsedTool` schema (id/version/name/description, inputs, outputs,
 * citations, license, profile, edam, xrefs, help). Stdio, requirements and
 * containers are intentionally out of scope — they're not on the TS
 * `ParsedTool` shape consumers depend on.
 */
export { parseInlineTool, type InlineRepresentation } from "./parse.js";
