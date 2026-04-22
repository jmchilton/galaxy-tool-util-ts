import type { ToolInfoService, ToolSource } from "@galaxy-tool-util/core";
import { getLatestTRSToolVersion, getTRSToolVersions, toolIdFromTrs } from "@galaxy-tool-util/core";
import type { ParsedTool } from "@galaxy-tool-util/schema";

import type { ToolSearchHit } from "./models/toolshed-search.js";
import { iterateToolSearchPages } from "./client/toolshed.js";

/**
 * A Tool Shed search hit flattened into a neutral, camelCase shape suitable
 * for UI consumption and cross-source dedup.
 *
 * Fields mirror the Tool Shed wire types but add two derived ids:
 * - `trsToolId` — `<owner>~<repo>~<toolId>`, consumable by the TRS API and
 *   `ToolInfoService.getToolInfo`.
 * - `fullToolId` — `<host>/repos/<owner>/<repo>/<toolId>[/<version>]`, the id
 *   Galaxy stores in workflows.
 */
export interface NormalizedToolHit {
  /** Source the hit came from. */
  source: ToolSource;
  toolId: string;
  toolName: string;
  toolDescription: string | null;
  repoName: string;
  repoOwnerUsername: string;
  score: number;
  /** Tool version, when the server supplies one. Tool Shed currently omits this. */
  version?: string;
  /** Mercurial changeset revision, when the server supplies one. */
  changesetRevision?: string;
  /** `<owner>~<repo>~<toolId>` — TRS-style id. */
  trsToolId: string;
  /** `<host>/repos/<owner>/<repo>/<toolId>[/<version>]` — full Galaxy tool id. */
  fullToolId: string;
  /** Populated when `enrich: true` was requested and the fetch succeeded. */
  parsedTool?: ParsedTool;
}

export interface SearchToolsServiceOptions {
  /** Server-side page size. Defaults to 20. */
  pageSize?: number;
  /** Hard cap on hits returned (after dedup). Defaults to 50. */
  maxResults?: number;
  /** When true, resolve each hit's `ParsedTool` via the info service (and cache). */
  enrich?: boolean;
}

export interface ToolSearchServiceOptions {
  /**
   * Sources to query. Only `type: "toolshed"` sources are searched — Galaxy
   * instances do not expose an equivalent tool-search endpoint.
   */
  sources: ToolSource[];
  /** Shared with `ToolInfoService` so enriched hits reuse its cache. */
  info: ToolInfoService;
  fetcher?: typeof fetch;
}

/**
 * High-level tool discovery service. Fans a query out across configured
 * Tool Shed sources, dedupes hits that describe the same `(owner, repo,
 * toolId)` across mirrors (first source wins), sorts by server score, and
 * optionally enriches each hit with a full `ParsedTool`.
 */
export class ToolSearchService {
  private readonly sources: ToolSource[];
  private readonly info: ToolInfoService;
  private readonly fetcher: typeof fetch;

  constructor(opts: ToolSearchServiceOptions) {
    this.sources = opts.sources.filter((s) => s.type === "toolshed");
    this.info = opts.info;
    this.fetcher = opts.fetcher ?? globalThis.fetch;
  }

  async searchTools(
    query: string,
    opts: SearchToolsServiceOptions = {},
  ): Promise<NormalizedToolHit[]> {
    const pageSize = opts.pageSize ?? 20;
    const maxResults = opts.maxResults ?? 50;

    const perSource = await Promise.all(
      this.sources.map((source) =>
        this.collectFromSource(source, query, pageSize, maxResults).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.debug(`Tool Shed search failed for ${source.url}: ${msg}`);
          return [] as NormalizedToolHit[];
        }),
      ),
    );

    const dedupKey = (h: NormalizedToolHit) => `${h.repoOwnerUsername}~${h.repoName}~${h.toolId}`;
    const seen = new Map<string, NormalizedToolHit>();
    for (let i = 0; i < this.sources.length; i++) {
      for (const hit of perSource[i]) {
        const k = dedupKey(hit);
        if (!seen.has(k)) seen.set(k, hit);
      }
    }
    const merged = Array.from(seen.values()).sort((a, b) => b.score - a.score);
    const truncated = merged.slice(0, maxResults);

    if (opts.enrich) {
      await Promise.all(truncated.map((hit) => this.enrich(hit)));
    }
    return truncated;
  }

  async getToolVersions(toolshedUrl: string, trsToolId: string): Promise<string[]> {
    const versions = await getTRSToolVersions(toolshedUrl, trsToolId, this.fetcher);
    return versions.map((v) => v.id);
  }

  async getLatestVersionForToolId(toolshedUrl: string, trsToolId: string): Promise<string | null> {
    return getLatestTRSToolVersion(toolshedUrl, trsToolId, this.fetcher);
  }

  private async collectFromSource(
    source: ToolSource,
    query: string,
    pageSize: number,
    maxResults: number,
  ): Promise<NormalizedToolHit[]> {
    const out: NormalizedToolHit[] = [];
    for await (const page of iterateToolSearchPages(source.url, query, {
      pageSize,
      fetcher: this.fetcher,
    })) {
      for (const hit of page.hits) {
        out.push(normalizeHit(hit, source));
      }
      if (out.length >= maxResults) return out;
    }
    return out;
  }

  private async enrich(hit: NormalizedToolHit): Promise<void> {
    try {
      const parsed = await this.info.getToolInfo(hit.trsToolId, hit.version ?? null);
      if (parsed !== null) hit.parsedTool = parsed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.debug(`Enrichment failed for ${hit.trsToolId}: ${msg}`);
    }
  }
}

function normalizeHit(hit: ToolSearchHit, source: ToolSource): NormalizedToolHit {
  const { id, name, description, repo_name, repo_owner_username, version, changeset_revision } =
    hit.tool;
  const trsToolId = `${repo_owner_username}~${repo_name}~${id}`;
  const base = toolIdFromTrs(source.url, trsToolId);
  const fullToolId = version ? `${base}/${version}` : base;
  const normalized: NormalizedToolHit = {
    source,
    toolId: id,
    toolName: name,
    toolDescription: description,
    repoName: repo_name,
    repoOwnerUsername: repo_owner_username,
    score: hit.score,
    trsToolId,
    fullToolId,
  };
  if (version !== undefined) normalized.version = version;
  if (changeset_revision !== undefined) normalized.changesetRevision = changeset_revision;
  return normalized;
}
