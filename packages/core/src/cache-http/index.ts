/**
 * @module @galaxy-tool-util/core/http
 *
 * Framework-agnostic HTTP-handler surface shared by `gxwf-web` and
 * `tool-cache-proxy`. Server adapters parse URL/body and serialize the
 * return value; failures throw `HttpError`.
 */

export { HttpError } from "./error.js";
export {
  cacheToTrs,
  cacheToTrsOne,
  entryToTrsVersion,
  type CacheIndexRecord,
} from "./cache-to-trs.js";
export {
  type HandlerCtx,
  type ListOptions,
  type SearchOptions,
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
} from "./handlers.js";
export type {
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
} from "./dto.js";
