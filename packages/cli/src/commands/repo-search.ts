import { DEFAULT_TOOLSHED_URL } from "@galaxy-tool-util/core";
import type { RepositorySearchHit } from "@galaxy-tool-util/search";
import { ToolFetchError, iterateRepoSearchPages } from "@galaxy-tool-util/search";

export interface RepoSearchOptions {
  pageSize?: string | number;
  maxResults?: string | number;
  page?: string | number;
  owner?: string;
  category?: string;
  json?: boolean;
}

export interface NormalizedRepoHit {
  toolshedUrl: string;
  repoId: string;
  repoName: string;
  repoOwnerUsername: string;
  description: string | null;
  homepageUrl: string | null;
  remoteRepositoryUrl: string | null;
  categories: string[];
  approved: boolean;
  timesDownloaded: number;
  score: number;
}

export interface RepoSearchJsonOutput {
  query: string;
  filters: { owner?: string; category?: string };
  hits: NormalizedRepoHit[];
}

function toInt(value: string | number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = typeof value === "number" ? value : parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalize(hit: RepositorySearchHit, toolshedUrl: string): NormalizedRepoHit {
  const r = hit.repository;
  const categories =
    r.categories === null
      ? []
      : r.categories
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c.length > 0);
  return {
    toolshedUrl,
    repoId: r.id,
    repoName: r.name,
    repoOwnerUsername: r.repo_owner_username,
    description: r.description,
    homepageUrl: r.homepage_url,
    remoteRepositoryUrl: r.remote_repository_url,
    categories,
    approved: r.approved,
    timesDownloaded: r.times_downloaded,
    score: hit.score,
  };
}

export async function runRepoSearch(query: string, opts: RepoSearchOptions): Promise<void> {
  const pageSize = toInt(opts.pageSize, 20);
  const maxResults = toInt(opts.maxResults, 50);
  const page = toInt(opts.page, 1);
  const toolshedUrl = DEFAULT_TOOLSHED_URL;

  const hits: NormalizedRepoHit[] = [];
  try {
    for await (const pageResults of iterateRepoSearchPages(toolshedUrl, query, {
      pageSize,
      page,
      owner: opts.owner,
      category: opts.category,
    })) {
      for (const raw of pageResults.hits) {
        hits.push(normalize(raw, toolshedUrl));
        if (hits.length >= maxResults) break;
      }
      if (hits.length >= maxResults) break;
    }
  } catch (err) {
    if (err instanceof ToolFetchError) {
      console.error(`Tool Shed repo search failed: ${err.message}`);
      process.exitCode = 3;
      return;
    }
    throw err;
  }

  hits.sort((a, b) => b.score - a.score);

  if (opts.json) {
    const filters: { owner?: string; category?: string } = {};
    if (opts.owner) filters.owner = opts.owner;
    if (opts.category) filters.category = opts.category;
    const envelope: RepoSearchJsonOutput = { query, filters, hits };
    console.log(JSON.stringify(envelope, null, 2));
  } else if (hits.length === 0) {
    console.error(`No repos for query: ${query}`);
  } else {
    console.log(formatTable(hits));
  }

  if (hits.length === 0) process.exitCode = 2;
}

function formatTable(hits: NormalizedRepoHit[]): string {
  const header = ["score", "downloads", "owner/repo", "categories", "description"];
  const rows = hits.map((h) => [
    h.score.toFixed(2),
    String(h.timesDownloaded),
    `${h.repoOwnerUsername}/${h.repoName}`,
    h.categories.join(",") || "-",
    truncate(h.description ?? "", 60),
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
