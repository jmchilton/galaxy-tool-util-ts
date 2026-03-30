import type { ParsedTool } from "./models/parsed-tool.js";
import { ToolCache } from "./cache/tool-cache.js";
import { cacheKey } from "./cache/cache-key.js";
import { fetchFromToolShed, fetchFromGalaxy } from "./client/toolshed.js";

export interface ToolSource {
  type: "toolshed" | "galaxy";
  url: string;
}

export interface ToolInfoOptions {
  cacheDir?: string;
  defaultToolshedUrl?: string;
  /** Multiple sources tried in order. If provided, overrides defaultToolshedUrl/galaxyUrl. */
  sources?: ToolSource[];
  /** @deprecated Use sources instead. Kept for simple single-source usage. */
  galaxyUrl?: string;
  fetcher?: typeof fetch;
}

export class ToolInfoService {
  readonly cache: ToolCache;
  private readonly sources: ToolSource[];
  private readonly fetcher: typeof fetch;

  constructor(opts?: ToolInfoOptions) {
    this.cache = new ToolCache({
      cacheDir: opts?.cacheDir,
      defaultToolshedUrl: opts?.defaultToolshedUrl,
    });
    this.fetcher = opts?.fetcher ?? globalThis.fetch;

    if (opts?.sources && opts.sources.length > 0) {
      this.sources = opts.sources;
    } else {
      // Build sources from legacy options
      this.sources = [
        {
          type: "toolshed",
          url:
            opts?.defaultToolshedUrl ?? this.cache.defaultToolshedUrl,
        },
      ];
      if (opts?.galaxyUrl) {
        this.sources.push({ type: "galaxy", url: opts.galaxyUrl });
      }
    }
  }

  async getToolInfo(
    toolId: string,
    toolVersion?: string | null,
  ): Promise<ParsedTool | null> {
    const coords = this.cache.resolveToolCoordinates(toolId, toolVersion);
    if (coords.version === null) {
      throw new Error(`No version available for tool: ${toolId}`);
    }
    const key = cacheKey(coords.toolshedUrl, coords.trsToolId, coords.version);

    // Check filesystem cache (ToolCache checks memory first internally)
    const cached = await this.cache.loadCached(key);
    if (cached !== null) return cached;

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
            coords.version,
            this.fetcher,
          );
          sourceLabel = "api";
          sourceUrl = `${source.url}/api/tools/${coords.trsToolId}/versions/${coords.version}`;
        } else {
          parsedTool = await fetchFromGalaxy(
            source.url,
            toolId,
            toolVersion,
            this.fetcher,
          );
          sourceLabel = "galaxy";
          sourceUrl = `${source.url}/api/tools/${encodeURIComponent(toolId)}/parsed`;
        }

        await this.cache.saveTool(
          key,
          parsedTool,
          coords.readableId,
          coords.version,
          sourceLabel,
          sourceUrl,
        );
        return parsedTool;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.debug(
          `${source.type} fetch failed (${source.url}) for ${coords.trsToolId}: ${msg}`,
        );
      }
    }

    return null;
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
    const key = cacheKey(coords.toolshedUrl, coords.trsToolId, version);
    await this.cache.saveTool(
      key,
      parsedTool,
      coords.readableId,
      version,
      source,
      sourceUrl,
    );
    return key;
  }
}
