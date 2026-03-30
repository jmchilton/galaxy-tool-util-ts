import { createHash } from "node:crypto";

export function cacheKey(
  toolshedUrl: string,
  trsToolId: string,
  toolVersion: string,
): string {
  const raw = `${toolshedUrl}/${trsToolId}/${toolVersion}`;
  return createHash("sha256").update(raw).digest("hex");
}
