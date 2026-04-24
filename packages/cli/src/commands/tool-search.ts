import type { ToolSource } from "@galaxy-tool-util/core";
import { DEFAULT_TOOLSHED_URL } from "@galaxy-tool-util/core";
import type { NormalizedToolHit } from "@galaxy-tool-util/search";
import { ToolFetchError, iterateToolSearchPages, normalizeHit } from "@galaxy-tool-util/search";

export interface ToolSearchOptions {
  pageSize?: string | number;
  maxResults?: string | number;
  json?: boolean;
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
  const source: ToolSource = { type: "toolshed", url: DEFAULT_TOOLSHED_URL };

  const hits: NormalizedToolHit[] = [];
  try {
    for await (const page of iterateToolSearchPages(source.url, query, { pageSize })) {
      for (const raw of page.hits) {
        hits.push(normalizeHit(raw, source));
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
