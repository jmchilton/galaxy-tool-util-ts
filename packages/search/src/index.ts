/**
 * @module @galaxy-tool-util/search
 *
 * Universal entry — safe to import in Node or browser. Tool discovery
 * primitives: Tool Shed wire types, response normalization, HTTP client, and
 * (in subsequent releases) `ToolSearchService` + ranking.
 */

export type { ToolSearchHit, SearchResults } from "./models/toolshed-search.js";
export { normalizeToolSearchResults } from "./models/toolshed-search.js";

export {
  searchTools,
  iterateToolSearchPages,
  getTRSToolVersions,
  getLatestTRSToolVersion,
  getToolRevisions,
  ToolFetchError,
} from "./client/index.js";
export type {
  SearchToolsOptions,
  TRSToolVersion,
  ToolRevisionsOptions,
  ToolRevisionMatch,
} from "./client/index.js";

export { ToolSearchService, normalizeHit } from "./tool-search.js";
export type {
  NormalizedToolHit,
  ToolSearchServiceOptions,
  SearchToolsServiceOptions,
} from "./tool-search.js";
