import * as S from "effect/Schema";

import { ParsedTool } from "@galaxy-tool-util/schema";
import { CacheIndex } from "./cache-index.js";
import { cacheKey } from "./cache-key.js";
import { parseToolshedToolId, toolIdFromTrs } from "./tool-id.js";
import type { CacheStorage } from "./storage/interface.js";
import { DEFAULT_TOOLSHED_URL, TOOLSHED_URL_ENV_VAR } from "./tool-cache-defaults.js";

export { DEFAULT_TOOLSHED_URL, TOOLSHED_URL_ENV_VAR };

function envToolshedUrl(): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    return process.env[TOOLSHED_URL_ENV_VAR];
  }
  return undefined;
}

export interface CacheStats {
  count: number;
  /** Omitted if the storage backend does not implement `stat()`. */
  totalBytes?: number;
  bySource: Record<string, number>;
  /** ISO 8601 timestamp of the oldest entry's `cached_at`. */
  oldest?: string;
  /** ISO 8601 timestamp of the newest entry's `cached_at`. */
  newest?: string;
}

export interface ResolvedCoordinates {
  toolshedUrl: string;
  trsToolId: string;
  version: string | null;
  readableId: string;
}

/**
 * Two-layer cache (memory + storage) for parsed Galaxy tool metadata.
 * Resolves tool IDs to cache keys, loads/saves tool JSON, and manages the cache index.
 *
 * `storage` is required — pass a `FilesystemCacheStorage` (Node.js) or
 * `IndexedDBCacheStorage` (browser). Node callers can use `makeNodeToolCache`
 * from `@galaxy-tool-util/core/node` to get the default filesystem setup.
 */
export class ToolCache {
  readonly defaultToolshedUrl: string;
  readonly index: CacheIndex;
  private readonly storage: CacheStorage;
  private memoryCache = new Map<string, ParsedTool>();

  constructor(opts: { storage: CacheStorage; defaultToolshedUrl?: string }) {
    this.defaultToolshedUrl = opts.defaultToolshedUrl ?? envToolshedUrl() ?? DEFAULT_TOOLSHED_URL;
    this.storage = opts.storage;
    this.index = new CacheIndex(this.storage);
  }

  resolveToolCoordinates(toolId: string, toolVersion?: string | null): ResolvedCoordinates {
    const parsed = parseToolshedToolId(toolId);
    if (parsed !== null) {
      return {
        toolshedUrl: parsed.toolshedUrl,
        trsToolId: parsed.trsToolId,
        version: toolVersion ?? parsed.toolVersion,
        readableId: toolIdFromTrs(parsed.toolshedUrl, parsed.trsToolId),
      };
    }
    return {
      toolshedUrl: this.defaultToolshedUrl,
      trsToolId: toolId,
      version: toolVersion ?? null,
      readableId: toolIdFromTrs(this.defaultToolshedUrl, toolId),
    };
  }

  async hasCached(toolId: string, toolVersion?: string | null): Promise<boolean> {
    const coords = this.resolveToolCoordinates(toolId, toolVersion);
    if (coords.version === null) return false;
    const key = await cacheKey(coords.toolshedUrl, coords.trsToolId, coords.version);
    return this.memoryCache.has(key) || (await this.storage.load(key)) !== null;
  }

  async loadCached(key: string): Promise<ParsedTool | null> {
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key)!;
    }
    try {
      const data = await this.storage.load(key);
      if (data === null) return null;
      const parsedTool = S.decodeUnknownSync(ParsedTool)(data);
      if (!(await this.index.has(key))) {
        const d = data as { id?: string };
        await this.index.add(
          key,
          d.id ?? parsedTool.id ?? "unknown",
          parsedTool.version ?? "unknown",
          "orphan",
        );
      }
      this.memoryCache.set(key, parsedTool);
      return parsedTool;
    } catch (err) {
      console.debug(`Failed to load cached tool ${key}: ${err}`);
      return null;
    }
  }

  /**
   * Load the raw cached payload without ParsedTool decoding.
   * Returns null only if the key is missing — surfaces stale or malformed entries
   * the inspector needs to render explicitly.
   */
  async loadCachedRaw(key: string): Promise<unknown | null> {
    return this.storage.load(key);
  }

  /**
   * Remove a single cached entry by cache key. Returns true if anything was
   * removed (storage or index), false if neither held the key.
   */
  async removeCached(key: string): Promise<boolean> {
    const inIndex = await this.index.has(key);
    const inStorage = inIndex ? false : (await this.storage.list()).includes(key);
    const existed = inIndex || inStorage;
    await this.storage.delete(key);
    await this.index.remove(key);
    this.memoryCache.delete(key);
    return existed;
  }

  async saveTool(
    key: string,
    parsedTool: ParsedTool,
    toolId: string,
    toolVersion: string,
    source: string,
    sourceUrl: string = "",
  ): Promise<void> {
    await this.storage.save(key, parsedTool);
    await this.index.add(key, toolId, toolVersion, source, sourceUrl);
    this.memoryCache.set(key, parsedTool);
  }

  async listCached(): Promise<
    Array<{
      cache_key: string;
      tool_id: string;
      tool_version: string;
      source: string;
      source_url: string;
      cached_at: string;
    }>
  > {
    return this.index.listAll();
  }

  async getCacheStats(): Promise<CacheStats> {
    const entries = await this.index.listAll();
    const bySource: Record<string, number> = {};
    let oldest: string | undefined;
    let newest: string | undefined;
    for (const e of entries) {
      bySource[e.source] = (bySource[e.source] ?? 0) + 1;
      if (oldest === undefined || e.cached_at < oldest) oldest = e.cached_at;
      if (newest === undefined || e.cached_at > newest) newest = e.cached_at;
    }
    const stats: CacheStats = { count: entries.length, bySource };
    if (oldest !== undefined) stats.oldest = oldest;
    if (newest !== undefined) stats.newest = newest;
    if (typeof this.storage.stat === "function") {
      let totalBytes = 0;
      for (const e of entries) {
        const s = await this.storage.stat(e.cache_key);
        if (s !== null) totalBytes += s.sizeBytes;
      }
      stats.totalBytes = totalBytes;
    }
    return stats;
  }

  async clearCache(toolIdPrefix?: string): Promise<void> {
    if (toolIdPrefix === undefined) {
      const keys = await this.storage.list();
      for (const key of keys) {
        await this.storage.delete(key);
      }
      await this.index.clear();
      this.memoryCache.clear();
    } else {
      const prefix = toolIdPrefix.replace(/\*$/, "");
      const toRemove = (await this.index.listAll()).filter((e) => e.tool_id.startsWith(prefix));
      for (const entry of toRemove) {
        await this.storage.delete(entry.cache_key);
        await this.index.remove(entry.cache_key);
        this.memoryCache.delete(entry.cache_key);
      }
    }
  }
}
