import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as S from "effect/Schema";

import { ParsedTool } from "../models/parsed-tool.js";
import { CacheIndex } from "./cache-index.js";
import { cacheKey } from "./cache-key.js";
import { parseToolshedToolId, toolIdFromTrs } from "./tool-id.js";

export const DEFAULT_CACHE_DIR = join(homedir(), ".galaxy", "tool_info_cache");
export const CACHE_DIR_ENV_VAR = "GALAXY_TOOL_CACHE_DIR";
export const DEFAULT_TOOLSHED_URL = "https://toolshed.g2.bx.psu.edu";
export const TOOLSHED_URL_ENV_VAR = "GALAXY_TOOLSHED_URL";

export function getCacheDir(override?: string): string {
  return override ?? process.env[CACHE_DIR_ENV_VAR] ?? DEFAULT_CACHE_DIR;
}

interface ResolvedCoordinates {
  toolshedUrl: string;
  trsToolId: string;
  version: string | null;
  readableId: string;
}

export class ToolCache {
  readonly cacheDir: string;
  readonly defaultToolshedUrl: string;
  readonly index: CacheIndex;
  private memoryCache = new Map<string, ParsedTool>();

  constructor(opts?: { cacheDir?: string; defaultToolshedUrl?: string }) {
    this.cacheDir = getCacheDir(opts?.cacheDir);
    this.defaultToolshedUrl =
      opts?.defaultToolshedUrl ?? process.env[TOOLSHED_URL_ENV_VAR] ?? DEFAULT_TOOLSHED_URL;
    this.index = new CacheIndex(this.cacheDir);
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

  private cachePath(key: string): string {
    return join(this.cacheDir, `${key}.json`);
  }

  hasCached(toolId: string, toolVersion?: string | null): boolean {
    const coords = this.resolveToolCoordinates(toolId, toolVersion);
    if (coords.version === null) return false;
    const key = cacheKey(coords.toolshedUrl, coords.trsToolId, coords.version);
    return this.memoryCache.has(key) || existsSync(this.cachePath(key));
  }

  async loadCached(key: string): Promise<ParsedTool | null> {
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key)!;
    }
    const path = this.cachePath(key);
    if (!existsSync(path)) return null;
    try {
      const raw = await readFile(path, "utf-8");
      const data = JSON.parse(raw);
      const parsedTool = S.decodeUnknownSync(ParsedTool)(data);
      if (!this.index.has(key)) {
        await this.index.add(key, data.id ?? "unknown", data.version ?? "unknown", "unknown");
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
    await mkdir(this.cacheDir, { recursive: true });
    const path = this.cachePath(key);
    await writeFile(path, JSON.stringify(parsedTool, null, 2));
    await this.index.add(key, toolId, toolVersion, source, sourceUrl);
    this.memoryCache.set(key, parsedTool);
  }

  listCached(): Array<{
    cache_key: string;
    tool_id: string;
    tool_version: string;
    source: string;
    source_url: string;
    cached_at: string;
  }> {
    return this.index.listAll();
  }

  async clearCache(toolIdPrefix?: string): Promise<void> {
    if (toolIdPrefix === undefined) {
      for (const entry of this.index.listAll()) {
        const path = this.cachePath(entry.cache_key);
        if (existsSync(path)) await unlink(path);
      }
      await this.index.clear();
      this.memoryCache.clear();
    } else {
      const prefix = toolIdPrefix.replace(/\*$/, "");
      const toRemove = this.index.listAll().filter((e) => e.tool_id.startsWith(prefix));
      for (const entry of toRemove) {
        const path = this.cachePath(entry.cache_key);
        if (existsSync(path)) await unlink(path);
        await this.index.remove(entry.cache_key);
        this.memoryCache.delete(entry.cache_key);
      }
    }
  }
}
