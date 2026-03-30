/**
 * Parse and manipulate Galaxy toolshed tool IDs.
 *
 * Input format: toolshed.g2.bx.psu.edu/repos/owner/repo/tool_name/version
 * Or with scheme: https://toolshed.g2.bx.psu.edu/repos/owner/repo/tool_name/version
 */

export interface ToolCoordinates {
  toolshedUrl: string;
  trsToolId: string;
  toolVersion: string | null;
}

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

export function toolIdFromTrs(toolshedUrl: string, trsToolId: string): string {
  const parts = trsToolId.split("~");
  const base = toolshedUrl.replace("https://", "").replace("http://", "");
  return `${base}/repos/${parts.join("/")}`;
}
