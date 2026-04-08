/**
 * Parse a Galaxy ToolShed tool ID into display parts.
 *
 * ToolShed format: {host}/repos/{owner}/{repo}/{tool_name}/{version}
 * Example: toolshed.g2.bx.psu.edu/repos/iuc/query_tabular/query_tabular/3.3.2
 *   → { toolName: "query_tabular", version: "3.3.2", owner: "iuc", repo: "query_tabular" }
 *
 * Non-toolshed IDs (built-ins like "__DATA_FETCH__") are returned as-is via `formatToolId`.
 */
export interface ParsedToolId {
  toolName: string;
  version: string;
  owner: string;
  repo: string;
}

export function parseToolId(id: string): ParsedToolId | null {
  const match = id.match(/\/repos\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  const [, owner, repo, toolName, version] = match;
  return { owner, repo, toolName, version };
}

/** Format a raw tool_id (possibly null) as a short human-readable string. */
export function formatToolId(id: string | null): string {
  if (!id) return "—";
  const parsed = parseToolId(id);
  if (!parsed) return id;
  return `${parsed.toolName}@${parsed.version} (${parsed.owner}/${parsed.repo})`;
}
