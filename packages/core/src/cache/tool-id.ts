/**
 * Parse and manipulate Galaxy toolshed tool IDs.
 *
 * Input format: toolshed.g2.bx.psu.edu/repos/owner/repo/tool_id/version
 * Or with scheme: https://toolshed.g2.bx.psu.edu/repos/owner/repo/tool_id/version
 */

/** Parsed components of a ToolShed tool ID. */
export interface ToolCoordinates {
  /** ToolShed base URL (with https:// scheme). */
  toolshedUrl: string;
  /** TRS-style tool ID: `owner~repo~tool_id`. */
  trsToolId: string;
  /** Tool version, or null if not present in the ID. */
  toolVersion: string | null;
}

/**
 * Parse a full ToolShed tool ID into its components.
 * Accepts both scheme-prefixed and bare formats:
 * - `toolshed.g2.bx.psu.edu/repos/owner/repo/tool_id/version`
 * - `https://toolshed.g2.bx.psu.edu/repos/owner/repo/tool_id/version`
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

/**
 * Normalize a short tool-id form to the TRS `owner~repo~tool` form.
 * Accepts the tilde form `owner~repo~tool` (returned unchanged) and the slash
 * short form `owner/repo/tool`. Returns null for anything else — notably stock
 * Galaxy tool ids (`cat1`, `upload1`) which have no owner/repo and must be
 * passed through verbatim.
 */
export function normalizeShortTrsToolId(input: string): string | null {
  if (input.includes("~")) return input;
  const parts = input.split("/").filter((p) => p.length > 0);
  if (parts.length === 3) return `${parts[0]}~${parts[1]}~${parts[2]}`;
  return null;
}

/**
 * Normalize any accepted tool-id form to the TRS `owner~repo~tool` form used
 * for TRS / ToolShed API lookups. Accepts:
 * - full ToolShed id: `toolshed.../repos/owner/repo/tool[/version]`
 * - tilde form: `owner~repo~tool`
 * - slash short form: `owner/repo/tool`
 * Throws if the input matches none of these.
 */
export function toTrsToolId(input: string): string {
  const parsed = parseToolshedToolId(input);
  if (parsed !== null) return parsed.trsToolId;
  const short = normalizeShortTrsToolId(input);
  if (short !== null) return short;
  throw new Error(
    "Invalid tool id: expected `<owner>~<repo>~<tool_id>`, `<owner>/<repo>/<tool_id>`, or " +
      `\`toolshed.../repos/<owner>/<repo>/<tool_id>[/version]\`, got: ${input}`,
  );
}

/** Reconstruct a human-readable tool ID from a ToolShed URL and TRS tool ID. */
export function toolIdFromTrs(toolshedUrl: string, trsToolId: string): string {
  const parts = trsToolId.split("~");
  const base = toolshedUrl.replace("https://", "").replace("http://", "");
  return `${base}/repos/${parts.join("/")}`;
}
