import type { ToolSource } from "@galaxy-tool-util/core";
import { DEFAULT_TOOLSHED_URL } from "@galaxy-tool-util/core";
import { makeNodeToolInfoService } from "@galaxy-tool-util/core/node";
import type { NormalizedToolHit } from "@galaxy-tool-util/search";
import { ToolFetchError, iterateToolSearchPages, normalizeHit } from "@galaxy-tool-util/search";

export interface ToolSearchOptions {
  pageSize?: string | number;
  maxResults?: string | number;
  page?: string | number;
  owner?: string;
  matchName?: boolean;
  json?: boolean;
  enrich?: boolean;
  cacheDir?: string;
}

export interface ToolSearchJsonOutput {
  query: string;
  hits: NormalizedToolHit[];
}

function toInt(value: string | number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = typeof value === "number" ? value : parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function runToolSearch(query: string, opts: ToolSearchOptions): Promise<void> {
  const pageSize = toInt(opts.pageSize, 20);
  const maxResults = toInt(opts.maxResults, 50);
  const page = toInt(opts.page, 1);
  const owner = opts.owner?.toLowerCase();
  const matchName = opts.matchName === true;
  const queryTokens = queryNameTokens(query);
  const source: ToolSource = { type: "toolshed", url: DEFAULT_TOOLSHED_URL };

  const hits: NormalizedToolHit[] = [];
  try {
    for await (const pageResults of iterateToolSearchPages(source.url, query, { pageSize, page })) {
      for (const raw of pageResults.hits) {
        const hit = normalizeHit(raw, source);
        if (owner !== undefined && hit.repoOwnerUsername.toLowerCase() !== owner) continue;
        if (matchName && !nameMatchesQuery(hit.toolName, queryTokens)) continue;
        hits.push(hit);
        if (hits.length >= maxResults) break;
      }
      if (hits.length >= maxResults) break;
    }
  } catch (err) {
    if (err instanceof ToolFetchError) {
      console.error(`Tool Shed search failed: ${err.message}`);
      process.exitCode = 3;
      return;
    }
    throw err;
  }

  hits.sort((a, b) => b.score - a.score);

  if (opts.enrich && hits.length > 0) {
    const info = makeNodeToolInfoService({ cacheDir: opts.cacheDir });
    await Promise.all(
      hits.map(async (hit) => {
        try {
          const parsed = await info.getToolInfo(hit.trsToolId, hit.version ?? null);
          if (parsed !== null) hit.parsedTool = parsed;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Enrichment failed for ${hit.trsToolId}: ${msg}`);
        }
      }),
    );
  }

  if (opts.json) {
    const envelope: ToolSearchJsonOutput = { query, hits };
    console.log(JSON.stringify(envelope, null, 2));
  } else if (hits.length === 0) {
    console.error(`No hits for query: ${query}`);
  } else {
    console.log(formatTable(hits));
  }

  if (hits.length === 0) {
    process.exitCode = 2;
  }
}

function formatTable(hits: NormalizedToolHit[]): string {
  const header = ["score", "owner/repo", "tool_id", "name", "description"];
  const rows = hits.map((h) => [
    h.score.toFixed(2),
    `${h.repoOwnerUsername}/${h.repoName}`,
    h.toolId,
    h.toolName,
    truncate(h.toolDescription ?? "", 60),
  ]);
  const widths = header.map((col, i) => Math.max(col.length, ...rows.map((r) => r[i].length)));
  const fmt = (cells: string[]): string =>
    cells
      .map((c, i) => c.padEnd(widths[i]))
      .join("  ")
      .trimEnd();
  return [fmt(header), fmt(widths.map((w) => "-".repeat(w))), ...rows.map(fmt)].join("\n");
}

function truncate(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 0);
}

function queryNameTokens(query: string): string[] {
  return tokenize(query);
}

function nameMatchesQuery(name: string, queryTokens: string[]): boolean {
  if (queryTokens.length === 0) return true;
  const nameTokens = new Set(tokenize(name));
  return queryTokens.some((t) => nameTokens.has(t));
}
