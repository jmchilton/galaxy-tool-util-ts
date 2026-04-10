import { join } from "node:path";
import { homedir } from "node:os";
import * as S from "effect/Schema";

import { ParsedTool } from "../models/parsed-tool.js";
import { CacheIndex } from "./cache-index.js";
import { cacheKey } from "./cache-key.js";
import { parseToolshedToolId, toolIdFromTrs } from "./tool-id.js";
import type { CacheStorage } from "./storage/interface.js";
import { FilesystemCacheStorage } from "./storage/filesystem.js";

/** Default cache directory: `~/.galaxy/tool_info_cache`. */
export const DEFAULT_CACHE_DIR = join(homedir(), ".galaxy", "tool_info_cache");
/** Environment variable to override the cache directory. */
export const CACHE_DIR_ENV_VAR = "GALAXY_TOOL_CACHE_DIR";
/** Default Galaxy ToolShed URL. */
export const DEFAULT_TOOLSHED_URL = "https://toolshed.g2.bx.psu.edu";
/** Environment variable to override the default ToolShed URL. */
export const TOOLSHED_URL_ENV_VAR = "GALAXY_TOOLSHED_URL";

/** Resolve cache directory: explicit override > env var > default. */
export function getCacheDir(override?: string): string {
  return override ?? process.env[CACHE_DIR_ENV_VAR] ?? DEFAULT_CACHE_DIR;
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
 * @param storage - Storage backend. Defaults to {@link FilesystemCacheStorage} (Node.js).
 *   Pass an {@link IndexedDBCacheStorage} for browser/Web Worker contexts.
 */
export class ToolCache {
  /** Cache directory — only meaningful when using the default FilesystemCacheStorage. */
  readonly cacheDir: string;
  readonly defaultToolshedUrl: string;
  readonly index: CacheIndex;
  private readonly storage: CacheStorage;
  private memoryCache = new Map<string, ParsedTool>();

  constructor(opts?: { cacheDir?: string; defaultToolshedUrl?: string; storage?: CacheStorage }) {
    this.defaultToolshedUrl =
      opts?.defaultToolshedUrl ?? process.env[TOOLSHED_URL_ENV_VAR] ?? DEFAULT_TOOLSHED_URL;

    if (opts?.storage !== undefined) {
      this.storage = opts.storage;
      this.cacheDir = opts?.cacheDir ?? "";
    } else {
      this.cacheDir = getCacheDir(opts?.cacheDir);
      this.storage = new FilesystemCacheStorage(this.cacheDir);
    }
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
        const d = data as { id?: string; version?: string };
        await this.index.add(key, d.id ?? "unknown", d.version ?? "unknown", "unknown");
      }
      this.memoryCache.set(key, parsedTool);
      return parsedTool;
    } catch (err) {
      console.debug(`Failed to load cached tool ${key}: ${err}`);
      return null;
    }
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
