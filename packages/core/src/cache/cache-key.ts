import { createHash } from "node:crypto";

/**
 * Compute a deterministic cache key (SHA-256 hex) for a tool.
 * The key is derived from the ToolShed URL, TRS tool ID, and version.
 */
export function cacheKey(toolshedUrl: string, trsToolId: string, toolVersion: string): string {
  const raw = `${toolshedUrl}/${trsToolId}/${toolVersion}`;
  return createHash("sha256").update(raw).digest("hex");
}
