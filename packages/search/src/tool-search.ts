import type { DiagnosticSink, ToolInfoService, ToolSource } from "@galaxy-tool-util/core";
import {
  getLatestTRSToolVersion,
  getTRSToolVersions,
  ignoreDiagnostic,
  toolIdFromTrs,
} from "@galaxy-tool-util/core";
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
  /** Starting result page requested from each Tool Shed. Defaults to 1. */
  page?: number;
  /** Server-side page size. Defaults to 20. */
  pageSize?: number;
  /** Hard cap on hits returned (after dedup). Defaults to 50. */
  maxResults?: number;
  /** Keep only hits owned by this Tool Shed user (case-insensitive). */
  owner?: string;
  /** Keep only hits whose tool name contains at least one complete query token. */
  matchName?: boolean;
  /** When true, resolve each hit's `ParsedTool` via the info service (and cache). */
  enrich?: boolean;
}

interface ResolvedSearchOptions {
  page: number;
  pageSize: number;
  maxResults: number;
  owner: string | undefined;
  nameTokens: string[] | undefined;
}

type SourceSearchResult =
  | { ok: true; hits: NormalizedToolHit[] }
  | { ok: false; source: ToolSource; error: unknown };

export interface ToolSearchServiceOptions {
  /**
   * Sources to query. Only `type: "toolshed"` sources are searched — Galaxy
   * instances do not expose an equivalent tool-search endpoint.
   */
  sources: ToolSource[];
  /** Shared with `ToolInfoService` so enriched hits reuse its cache. */
  info: ToolInfoService;
  fetcher?: typeof fetch;
  /**
   * Receives recoverable search-source and enrichment-callback diagnostics.
   * Diagnostics produced inside `info` use that service's own sink.
   */
  onDiagnostic?: DiagnosticSink;
}

/**
 * High-level tool discovery service. Fans a query out across configured
 * Tool Shed sources, dedupes hits that describe the same `(owner, repo,
 * toolId)` across mirrors (first source wins), sorts by server score, and
 * optionally enriches each hit with a full `ParsedTool`. A failed source is
 * tolerated when another source completes; if every searchable source fails,
 * the first source error is rethrown so callers can distinguish failure from
 * an empty result set.
 */
export class ToolSearchService {
  private readonly sources: ToolSource[];
  private readonly info: ToolInfoService;
  private readonly fetcher: typeof fetch;
  private readonly onDiagnostic: DiagnosticSink;

  constructor(opts: ToolSearchServiceOptions) {
    this.sources = opts.sources.filter((s) => s.type === "toolshed");
    this.info = opts.info;
    this.fetcher = opts.fetcher ?? globalThis.fetch;
    this.onDiagnostic = opts.onDiagnostic ?? ignoreDiagnostic;
  }

  async searchTools(
    query: string,
    opts: SearchToolsServiceOptions = {},
  ): Promise<NormalizedToolHit[]> {
    const resolvedOpts: ResolvedSearchOptions = {
      page: opts.page ?? 1,
      pageSize: opts.pageSize ?? 20,
      maxResults: opts.maxResults ?? 50,
      owner: opts.owner?.toLowerCase(),
      nameTokens: opts.matchName ? tokenize(query) : undefined,
    };

    const sourceResults: SourceSearchResult[] = await Promise.all(
      this.sources.map(async (source) => {
        try {
          const hits = await this.collectFromSource(source, query, resolvedOpts);
          return { ok: true, hits };
        } catch (error) {
          return { ok: false, source, error };
        }
      }),
    );

    const failures = sourceResults.filter((result) => !result.ok);
    if (sourceResults.length > 0 && failures.length === sourceResults.length) {
      throw failures[0].error;
    }
    for (const failure of failures) {
      const msg = failure.error instanceof Error ? failure.error.message : String(failure.error);
      this.onDiagnostic(`Tool Shed search failed for ${failure.source.url}: ${msg}`);
    }
    const perSource = sourceResults.map((result) => (result.ok ? result.hits : []));

    const dedupKey = (h: NormalizedToolHit) => `${h.repoOwnerUsername}~${h.repoName}~${h.toolId}`;
    const seen = new Map<string, NormalizedToolHit>();
    for (let i = 0; i < this.sources.length; i++) {
      for (const hit of perSource[i]) {
        const k = dedupKey(hit);
        if (!seen.has(k)) seen.set(k, hit);
      }
    }
    const merged = Array.from(seen.values()).sort((a, b) => b.score - a.score);
    const truncated = merged.slice(0, resolvedOpts.maxResults);

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
    opts: ResolvedSearchOptions,
  ): Promise<NormalizedToolHit[]> {
    const out: NormalizedToolHit[] = [];
    for await (const page of iterateToolSearchPages(source.url, query, {
      page: opts.page,
      pageSize: opts.pageSize,
      fetcher: this.fetcher,
    })) {
      for (const rawHit of page.hits) {
        const hit = normalizeHit(rawHit, source);
        if (!matchesFilters(hit, opts)) continue;
        out.push(hit);
        if (out.length >= opts.maxResults) return out;
      }
    }
    return out;
  }

  private async enrich(hit: NormalizedToolHit): Promise<void> {
    try {
      const parsed = await this.info.getToolInfo(hit.trsToolId, hit.version ?? null);
      if (parsed !== null) hit.parsedTool = parsed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.onDiagnostic(`Enrichment failed for ${hit.trsToolId}: ${msg}`);
    }
  }
}

function matchesFilters(hit: NormalizedToolHit, opts: ResolvedSearchOptions): boolean {
  if (opts.owner !== undefined && hit.repoOwnerUsername.toLowerCase() !== opts.owner) return false;
  if (opts.nameTokens !== undefined && !nameMatchesQuery(hit.toolName, opts.nameTokens))
    return false;
  return true;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((token) => token.length > 0);
}

function nameMatchesQuery(name: string, queryTokens: string[]): boolean {
  if (queryTokens.length === 0) return true;
  const nameTokens = new Set(tokenize(name));
  return queryTokens.some((token) => nameTokens.has(token));
}

export function normalizeHit(hit: ToolSearchHit, source: ToolSource): NormalizedToolHit {
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
