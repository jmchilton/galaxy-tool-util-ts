import { ToolFetchError } from "@galaxy-tool-util/core";

import type { SearchResults } from "../models/toolshed-search.js";
import type { RepositorySearchHit } from "../models/toolshed-repo-search.js";
import { normalizeRepoSearchResults } from "../models/toolshed-repo-search.js";

const REQUEST_TIMEOUT_MS = 30_000;

export interface SearchRepositoriesOptions {
  page?: number;
  pageSize?: number;
  /** Restrict to a single owner via the server-side `owner:` reserved keyword. */
  owner?: string;
  /** Restrict to a single category via the server-side `category:` keyword. */
  category?: string;
  fetcher?: typeof fetch;
}

/**
 * Build a Tool Shed `q=` value with optional `owner:` / `category:` reserved
 * keywords appended. Categories with whitespace get double-quoted.
 */
export function buildRepoQuery(
  query: string,
  filters: { owner?: string; category?: string } = {},
): string {
  const parts: string[] = [];
  const trimmed = query.trim();
  if (trimmed.length > 0) parts.push(trimmed);
  if (filters.owner) parts.push(`owner:${filters.owner}`);
  if (filters.category) {
    const cat = filters.category;
    parts.push(`category:${/\s/.test(cat) ? `"${cat}"` : cat}`);
  }
  return parts.join(" ");
}

export async function searchRepositories(
  toolshedUrl: string,
  query: string,
  opts: SearchRepositoriesOptions = {},
): Promise<SearchResults<RepositorySearchHit>> {
  const fetcher = opts.fetcher ?? globalThis.fetch;
  const q = buildRepoQuery(query, { owner: opts.owner, category: opts.category });
  const params = new URLSearchParams({ q });
  if (opts.page !== undefined) params.set("page", String(opts.page));
  if (opts.pageSize !== undefined) params.set("page_size", String(opts.pageSize));

  const url = `${toolshedUrl}/api/repositories?${params.toString()}`;
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new ToolFetchError(
      `Tool Shed repo search request to ${url} failed: ${(err as Error).message}`,
      url,
    );
  }

  if (response.status === 404) {
    return {
      total_results: 0,
      page: opts.page ?? 1,
      page_size: opts.pageSize ?? 0,
      hostname: toolshedUrl,
      hits: [],
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ToolFetchError(
      `Tool Shed repo search request to ${url} failed: ${response.status} ${body.slice(0, 200)}`,
      url,
      response.status,
    );
  }

  const json: unknown = await response.json();
  try {
    return normalizeRepoSearchResults(json);
  } catch (err) {
    throw new ToolFetchError(
      `Tool Shed repo search response from ${url} was malformed: ${(err as Error).message}`,
      url,
      response.status,
    );
  }
}

/**
 * Iterate Tool Shed repo search pages. Stops when the server returns fewer
 * hits than `pageSize` (or none).
 */
export async function* iterateRepoSearchPages(
  toolshedUrl: string,
  query: string,
  opts: SearchRepositoriesOptions = {},
): AsyncGenerator<SearchResults<RepositorySearchHit>, void, void> {
  const pageSize = opts.pageSize ?? 10;
  let page = opts.page ?? 1;
  while (true) {
    const results = await searchRepositories(toolshedUrl, query, { ...opts, page, pageSize });
    yield results;
    if (results.hits.length < pageSize) return;
    page += 1;
  }
}
