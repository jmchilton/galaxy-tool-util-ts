/**
 * Parse and manipulate Galaxy toolshed tool IDs.
 *
 * Input format: toolshed.g2.bx.psu.edu/repos/owner/repo/tool_name/version
 * Or with scheme: https://toolshed.g2.bx.psu.edu/repos/owner/repo/tool_name/version
 */

/** Parsed components of a ToolShed tool ID. */
export interface ToolCoordinates {
  /** ToolShed base URL (with https:// scheme). */
  toolshedUrl: string;
  /** TRS-style tool ID: `owner~repo~tool_name`. */
  trsToolId: string;
  /** Tool version, or null if not present in the ID. */
  toolVersion: string | null;
}

/**
 * Parse a full ToolShed tool ID into its components.
 * Accepts both scheme-prefixed and bare formats:
 * - `toolshed.g2.bx.psu.edu/repos/owner/repo/tool_name/version`
 * - `https://toolshed.g2.bx.psu.edu/repos/owner/repo/tool_name/version`
 * @returns Parsed coordinates, or null if the ID doesn't match the ToolShed format.
 */
export function parseToolshedToolId(toolId: string): ToolCoordinates | null {
  if (!toolId.includes("/repos/")) {
    return null;
  }
  const [toolshedBase, rest] = toolId.split("/repos/", 2);
  const segments = rest.split("/");
  if (segments.length < 3) {
    return null;
  }
  const trsToolId = `${segments[0]}~${segments[1]}~${segments[2]}`;
  const toolVersion = segments.length > 3 ? segments[3] : null;
  const toolshedUrl = toolshedBase.startsWith("http") ? toolshedBase : `https://${toolshedBase}`;
  return { toolshedUrl, trsToolId, toolVersion };
}

/** Reconstruct a human-readable tool ID from a ToolShed URL and TRS tool ID. */
export function toolIdFromTrs(toolshedUrl: string, trsToolId: string): string {
  const parts = trsToolId.split("~");
  const base = toolshedUrl.replace("https://", "").replace("http://", "");
  return `${base}/repos/${parts.join("/")}`;
}
