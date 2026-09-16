/**
 * Convert cache index entries into GA4GH TRS Tool / ToolVersion shapes.
 *
 * Mapping (per merged plan §3):
 *   Tool.id              ← tool_id (TRS form, ~-separated; we already store it that way)
 *   Tool.organization    ← left of first `~`, falling back to tool_id when there is no separator
 *   Tool.url             ← {baseUrl}/api/ga4gh/trs/v2/tools/{tool_id}
 *   Tool.toolclass       ← GALAXY_TOOL_CLASS
 *   Tool.versions        ← entries grouped by tool_id, mapped to ToolVersion
 *   ToolVersion.id       ← tool_version
 *   ToolVersion.url      ← {baseUrl}/api/ga4gh/trs/v2/tools/{tool_id}/versions/{tool_version}
 *   ToolVersion.descriptor_type ← ["GALAXY"]
 */

import { GALAXY_TOOL_CLASS, type TrsTool, type TrsToolVersion } from "@galaxy-tool-util/schema";
import { parseToolshedToolId } from "../cache/tool-id.js";

/** Cache index entry shape (from `ToolCache.listCached()`). */
export interface CacheIndexRecord {
  cache_key: string;
  tool_id: string;
  tool_version: string;
  source: string;
  source_url: string;
  cached_at: string;
}

const TRS_BASE = "/api/ga4gh/trs/v2/tools";

function trsToolUrl(baseUrl: string, toolId: string): string {
  return `${baseUrl}${TRS_BASE}/${encodeURIComponent(toolId)}`;
}

function trsVersionUrl(baseUrl: string, toolId: string, toolVersion: string): string {
  return `${trsToolUrl(baseUrl, toolId)}/versions/${encodeURIComponent(toolVersion)}`;
}

/**
 * Normalize a cache `tool_id` to TRS form (`owner~repo~tool_id`). The cache
 * historically stores readable form (`shed/repos/owner/repo/tool_id`); newer
 * entries may already be TRS-shaped. Callers reading off the cache index
 * should always go through this.
 */
export function toTrsToolId(rawToolId: string): string {
  const parsed = parseToolshedToolId(rawToolId);
  return parsed === null ? rawToolId : parsed.trsToolId;
}

function organizationOf(trsToolId: string): string {
  const idx = trsToolId.indexOf("~");
  return idx === -1 ? trsToolId : trsToolId.slice(0, idx);
}

export function entryToTrsVersion(entry: CacheIndexRecord, baseUrl: string): TrsToolVersion {
  const trsToolId = toTrsToolId(entry.tool_id);
  return {
    id: entry.tool_version,
    url: trsVersionUrl(baseUrl, trsToolId, entry.tool_version),
    descriptor_type: ["GALAXY"],
  };
}

/** Group entries by TRS tool_id and emit one TRS Tool per group. */
export function cacheToTrs(entries: CacheIndexRecord[], baseUrl: string): TrsTool[] {
  const groups = new Map<string, CacheIndexRecord[]>();
  for (const entry of entries) {
    const trsToolId = toTrsToolId(entry.tool_id);
    const list = groups.get(trsToolId);
    if (list === undefined) groups.set(trsToolId, [entry]);
    else list.push(entry);
  }
  const tools: TrsTool[] = [];
  for (const [trsToolId, group] of groups) {
    tools.push({
      id: trsToolId,
      url: trsToolUrl(baseUrl, trsToolId),
      organization: organizationOf(trsToolId),
      toolclass: GALAXY_TOOL_CLASS,
      versions: group.map((e) => entryToTrsVersion(e, baseUrl)),
    });
  }
  return tools;
}

/** Build a single TRS Tool by TRS-form tool id, or null if no entries match. */
export function cacheToTrsOne(
  entries: CacheIndexRecord[],
  trsToolId: string,
  baseUrl: string,
): TrsTool | null {
  const matching = entries.filter((e) => toTrsToolId(e.tool_id) === trsToolId);
  if (matching.length === 0) return null;
  return {
    id: trsToolId,
    url: trsToolUrl(baseUrl, trsToolId),
    organization: organizationOf(trsToolId),
    toolclass: GALAXY_TOOL_CLASS,
    versions: matching.map((e) => entryToTrsVersion(e, baseUrl)),
  };
}
