/**
 * DTOs for the shared cache HTTP surface — admin namespace.
 *
 * camelCase at the API boundary; snake_case stays internal to the on-disk
 * cache index. See `decorate()` in handlers.ts for the mapping.
 */

import type { CacheStats } from "../cache/tool-cache.js";

/** Cache entry decorated with admin metadata for inspector UIs. */
export interface CachedToolEntry {
  cacheKey: string;
  toolId: string;
  toolVersion: string;
  /** Cache request version when it differs from the displayed wrapper version (e.g. _default_). */
  requestVersion?: string;
  source: string;
  sourceUrl: string;
  cachedAt: string;
  /** Omitted if storage backend lacks `stat()` support. */
  sizeBytes?: number;
  /** Probed only when the caller requests `decode=true`; defaults to true. */
  decodable: boolean;
  /** Deep link to the ToolShed repo page when the tool id is parseable. */
  toolshedUrl?: string;
  /** False for orphan reconstructions / unknown ids — they can't drive a refetch. */
  refetchable: boolean;
}

export interface ListResponse {
  entries: CachedToolEntry[];
  stats: CacheStats;
}

export interface DeleteResponse {
  removed: boolean;
}

export interface ClearResponse {
  removed: number;
}

export interface RefetchRequest {
  toolId: string;
  toolVersion?: string;
}

export interface RefetchResponse {
  cacheKey: string;
  fetched: boolean;
  alreadyCached: boolean;
}

export interface AddRequest {
  toolId: string;
  toolVersion?: string;
}

export interface AddResponse {
  cacheKey: string;
  alreadyCached: boolean;
}

/** Tool search results (substring match over id/name/description). */
export interface SearchResults {
  q: string;
  page: number;
  pageSize: number;
  total: number;
  hits: Array<{
    toolId: string;
    toolVersion: string;
    name?: string;
    description?: string;
  }>;
}

/** Schema kind for parameter_*_schema endpoints. */
export type ParameterSchemaKind = "request" | "landing_request" | "test_case_xml";
