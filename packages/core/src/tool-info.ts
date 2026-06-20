import type { ParsedTool } from "@galaxy-tool-util/schema";
import { DEFAULT_TOOL_VERSION, ToolCache } from "./cache/tool-cache.js";
import { cacheKey } from "./cache/cache-key.js";
import { fetchFromToolShed, fetchFromGalaxy } from "./client/toolshed.js";
import { getLatestTRSToolVersion } from "./client/trs.js";
import type { CacheStorage } from "./cache/storage/interface.js";

/** A remote source for fetching tool metadata. */
export interface ToolSource {
  type: "toolshed" | "galaxy";
  url: string;
}

/** Options for constructing a {@link ToolInfoService}. */
export interface ToolInfoOptions {
  /** Cache storage backend — FilesystemCacheStorage (Node) or IndexedDBCacheStorage (browser). */
  storage: CacheStorage;
  defaultToolshedUrl?: string;
  /** Multiple sources tried in order. If provided, overrides defaultToolshedUrl/galaxyUrl. */
  sources?: ToolSource[];
  /** @deprecated Use sources instead. Kept for simple single-source usage. */
  galaxyUrl?: string;
  fetcher?: typeof fetch;
}

/**
 * High-level service for fetching Galaxy tool metadata with automatic caching.
 * Tries configured sources in order and caches on first successful fetch.
 */
export class ToolInfoService {
  readonly cache: ToolCache;
  private readonly sources: ToolSource[];
  private readonly fetcher: typeof fetch;

  constructor(opts: ToolInfoOptions) {
    this.cache = new ToolCache({
      storage: opts.storage,
      defaultToolshedUrl: opts.defaultToolshedUrl,
    });
    this.fetcher = opts.fetcher ?? globalThis.fetch;

    if (opts.sources) {
      this.sources = opts.sources;
    } else {
      this.sources = [
        {
          type: "toolshed",
          url: opts.defaultToolshedUrl ?? this.cache.defaultToolshedUrl,
        },
      ];
      if (opts.galaxyUrl) {
        this.sources.push({ type: "galaxy", url: opts.galaxyUrl });
      }
    }
  }

  async getToolInfo(toolId: string, toolVersion?: string | null): Promise<ParsedTool | null> {
    const resolved = await this.resolveTool(toolId, toolVersion);
    return resolved === null ? null : resolved.tool;
  }

  /**
   * Like {@link getToolInfo}, but also returns the cache key the tool lives under
   * — the authoritative key this service caches with. Callers needing the key
   * should use this rather than re-deriving it, so the subtle version-keying
   * below stays owned in one place.
   */
  async resolveTool(
    toolId: string,
    toolVersion?: string | null,
  ): Promise<{ tool: ParsedTool; key: string } | null> {
    const coords = this.cache.resolveToolCoordinates(toolId, toolVersion);
    // `keyVersion` keys the cache entry. The `_default_` sentinel is a stable handle
    // for an unversioned stock/built-in request and must survive as the key so the
    // offline json-schema validate path (which keys by `_default_`) gets cache hits.
    let keyVersion = coords.version;
    if (keyVersion === null) {
      // ToolShed tool without a pin — must resolve a concrete version before we can key it.
      const resolved = await this.resolveLatestVersion(coords.toolshedUrl, coords.trsToolId);
      if (resolved === null) {
        console.debug(`No version available for tool: ${toolId}`);
        return null;
      }
      keyVersion = resolved;
    }
    const key = await cacheKey(coords.toolshedUrl, coords.trsToolId, keyVersion);

    // Check storage cache (ToolCache checks memory first internally). Done before any
    // `_default_` version discovery so cache hits stay network-free.
    const cached = await this.cache.loadCached(key);
    if (cached !== null) return { tool: cached, key };

    // Cache miss — pick the concrete version actually requested from the remote. For a
    // `_default_` request, resolve one now while keeping the key as `_default_`; fall back
    // to the sentinel when the shed can't list versions (genuinely versionless built-ins
    // like __APPLY_RULES__).
    let fetchVersion = keyVersion;
    if (keyVersion === DEFAULT_TOOL_VERSION) {
      const resolved = await this.resolveLatestVersion(coords.toolshedUrl, coords.trsToolId);
      fetchVersion = resolved ?? DEFAULT_TOOL_VERSION;
    }

    // Try each source in order
    for (const source of this.sources) {
      try {
        let parsedTool: ParsedTool;
        let sourceLabel: string;
        let sourceUrl: string;

        if (source.type === "toolshed") {
          parsedTool = await fetchFromToolShed(
            source.url,
            coords.trsToolId,
            fetchVersion,
            this.fetcher,
          );
          sourceLabel = "api";
          sourceUrl = `${source.url}/api/tools/${coords.trsToolId}/versions/${fetchVersion}`;
        } else {
          parsedTool = await fetchFromGalaxy(source.url, toolId, fetchVersion, this.fetcher);
          sourceLabel = "galaxy";
          sourceUrl = `${source.url}/api/tools/${encodeURIComponent(toolId)}/parsed`;
        }

        // Key under `keyVersion` (may be `_default_`); record the concrete version the
        // body reports (falling back to `fetchVersion`) as the index/display version so
        // `list` surfaces it.
        const indexVersion = parsedTool.version ?? fetchVersion;
        await this.cache.saveTool(
          key,
          parsedTool,
          coords.readableId,
          indexVersion,
          sourceLabel,
          sourceUrl,
        );
        return { tool: parsedTool, key };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.debug(
          `${source.type} fetch failed (${source.url}) for ${coords.trsToolId}: ${msg}`,
        );
      }
    }

    return null;
  }

  /**
   * Resolve the latest TRS version for a tool on a Tool Shed. Returns `null`
   * if the tool is unknown to the shed or has no published versions.
   */
  private async resolveLatestVersion(
    toolshedUrl: string,
    trsToolId: string,
  ): Promise<string | null> {
    try {
      return await getLatestTRSToolVersion(toolshedUrl, trsToolId, this.fetcher);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.debug(`TRS latest-version lookup failed for ${trsToolId} on ${toolshedUrl}: ${msg}`);
      return null;
    }
  }

  /**
   * Populate the cache for a known tool id. Idempotent by default — when the
   * entry already exists, returns `{alreadyCached: true, fetched: false}` and
   * skips the remote fetch. Pass `{force: true}` to evict the existing entry
   * first and re-fetch unconditionally.
   *
   * Used by inspector / debug surfaces (gxwf-web `/api/tool-cache/{add,refetch}`).
   */
  async refetch(
    toolId: string,
    toolVersion?: string | null,
    opts?: { force?: boolean },
  ): Promise<{ cacheKey: string; fetched: boolean; alreadyCached: boolean }> {
    const coords = this.cache.resolveToolCoordinates(toolId, toolVersion ?? null);
    const resolvedVersion = coords.version;
    let alreadyCached = false;
    if (resolvedVersion !== null) {
      alreadyCached = await this.cache.hasCached(toolId, resolvedVersion);
    }
    if (alreadyCached && !opts?.force) {
      const key = await cacheKey(coords.toolshedUrl, coords.trsToolId, resolvedVersion!);
      return { cacheKey: key, fetched: false, alreadyCached: true };
    }
    if (alreadyCached && opts?.force && resolvedVersion !== null) {
      const key = await cacheKey(coords.toolshedUrl, coords.trsToolId, resolvedVersion);
      await this.cache.removeCached(key);
    }
    const tool = await this.getToolInfo(toolId, toolVersion ?? null);
    if (tool === null) {
      throw new Error(`Failed to fetch tool: ${toolId}`);
    }
    // Key derivation here is intentionally independent of getToolInfo's persistence
    // (callers/tests treat getToolInfo as a mockable fetch seam that need not write
    // the cache). Mirror its keying: `_default_` and explicit pins key as-is
    // (coords.version); an unpinned ToolShed tool (coords.version === null) keys by
    // the resolved version. Must not key a stock tool by tool.version — its entry
    // lives under the `_default_` key, not `~<version>`.
    //
    // Known edge (tracked): a stock entry is keyed under `_default_` but its index/display
    // version is the concrete one (e.g. `1.1.1`). A caller that refetches by the *display*
    // version (gxwf-web inspector does) passes `1.1.1`, misses the `_default_` key, and
    // writes a duplicate sibling instead of refreshing. Unreachable until the shed's TRS
    // version-list endpoint is healthy; fix needs the request version persisted in the index.
    const keyVersion = coords.version ?? tool.version ?? "unknown";
    const key = await cacheKey(coords.toolshedUrl, coords.trsToolId, keyVersion);
    return { cacheKey: key, fetched: true, alreadyCached };
  }

  async addTool(
    toolId: string,
    toolVersion: string,
    parsedTool: ParsedTool,
    source: string = "local",
    sourceUrl: string = "",
  ): Promise<string> {
    const coords = this.cache.resolveToolCoordinates(toolId, toolVersion);
    const version = coords.version ?? toolVersion;
    const key = await cacheKey(coords.toolshedUrl, coords.trsToolId, version);
    await this.cache.saveTool(key, parsedTool, coords.readableId, version, source, sourceUrl);
    return key;
  }
}
