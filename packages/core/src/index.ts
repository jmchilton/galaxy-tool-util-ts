/**
 * @module @galaxy-tool-util/core
 *
 * Universal entry — safe to import in Node or browser. Symbols that require
 * Node built-ins (filesystem cache storage, YAML config loading) live under
 * `@galaxy-tool-util/core/node`.
 */

export {
  /** Parse a full ToolShed tool ID into ToolCoordinates (toolshedUrl, trsToolId, version). */
  parseToolshedToolId,
  /** Reconstruct a full tool ID from ToolShed URL and TRS tool ID. */
  toolIdFromTrs,
  /** Compute a deterministic SHA-256 cache key from ToolShed URL + TRS ID + version. */
  cacheKey,
  /** Cache metadata index — tracks tool IDs, versions, sources, and timestamps. */
  CacheIndex,
  /** Two-layer cache (memory + storage) for parsed tool metadata. */
  ToolCache,
  DEFAULT_TOOLSHED_URL,
  TOOLSHED_URL_ENV_VAR,
} from "./cache/index.js";
export type {
  ToolCoordinates,
  CacheIndexEntry,
  CacheIndexData,
  CacheStorage,
  ResolvedCoordinates,
  CacheStats,
} from "./cache/index.js";
/** IndexedDB-backed cache storage for browser/Web Worker contexts. */
export { IndexedDBCacheStorage } from "./cache/index.js";
/** Fetch parsed tool metadata from a ToolShed instance via TRS API. */
export { fetchFromToolShed, fetchFromGalaxy, ToolFetchError } from "./client/index.js";
/** Query TRS for the set of versions published for a tool. */
export { getTRSToolVersions, getLatestTRSToolVersion } from "./client/index.js";
export type { TRSToolVersion } from "./client/index.js";
/** High-level service: fetch tools from multiple sources with automatic caching. */
export { ToolInfoService } from "./tool-info.js";
export type { ToolInfoOptions, ToolSource } from "./tool-info.js";
/** Shared YAML config schema for tool sources and cache settings. */
export {
  WorkflowToolConfig,
  ToolSourceConfig,
  ToolCacheConfig,
  toolInfoOptionsFromConfig,
} from "./config.js";
export type { ConfigToolInfoOptions } from "./config.js";

/** Framework-agnostic HTTP handlers + DTOs shared by gxwf-web and tool-cache-proxy. */
export {
  HttpError,
  cacheToTrs,
  cacheToTrsOne,
  entryToTrsVersion,
  listCache,
  cacheStats,
  deleteCacheEntry,
  clearCache,
  refetchTool,
  addTool,
  searchTools,
  trsListTools,
  trsGetTool,
  trsListVersions,
  getParsedTool,
  getParameterSchema,
  getToolSource,
} from "./cache-http/index.js";
export type {
  HandlerCtx,
  ListOptions,
  SearchOptions,
  CacheIndexRecord,
  AddRequest,
  AddResponse,
  CachedToolEntry,
  ClearResponse,
  DeleteResponse,
  ListResponse,
  ParameterSchemaKind,
  RefetchRequest,
  RefetchResponse,
  SearchResults,
} from "./cache-http/index.js";
