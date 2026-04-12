/**
 * Compute a deterministic cache key (SHA-256 hex) for a tool.
 * The key is derived from the ToolShed URL, TRS tool ID, and version.
 * Uses the Web Crypto API (available in Node.js ≥15 and all modern browsers/Web Workers).
 */
export async function cacheKey(
  toolshedUrl: string,
  trsToolId: string,
  toolVersion: string,
): Promise<string> {
  const raw = `${toolshedUrl}/${trsToolId}/${toolVersion}`;
  const encoded = new TextEncoder().encode(raw);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
