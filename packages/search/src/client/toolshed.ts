import { ToolFetchError } from "@galaxy-tool-util/core";

import type { SearchResults, ToolSearchHit } from "../models/toolshed-search.js";
import { normalizeToolSearchResults } from "../models/toolshed-search.js";

const REQUEST_TIMEOUT_MS = 30_000;

export interface SearchToolsOptions {
  page?: number;
  pageSize?: number;
  fetcher?: typeof fetch;
}

/**
 * Fetch a page of tool search results from a Tool Shed.
 *
 * Pass the query verbatim — the Tool Shed wraps it with `*term*` server-side,
 * so any client-side rewrite would double-wrap and break scoring.
 *
 * An `ObjectNotFound` 404 (which some Tool Shed versions return when paging
 * past the last page of hits) is treated as an empty page.
 */
export async function searchTools(
  toolshedUrl: string,
  query: string,
  opts: SearchToolsOptions = {},
): Promise<SearchResults<ToolSearchHit>> {
  const fetcher = opts.fetcher ?? globalThis.fetch;
  const params = new URLSearchParams({ q: query });
  if (opts.page !== undefined) params.set("page", String(opts.page));
  if (opts.pageSize !== undefined) params.set("page_size", String(opts.pageSize));

  const url = `${toolshedUrl}/api/tools?${params.toString()}`;
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new ToolFetchError(
      `Tool Shed search request to ${url} failed: ${(err as Error).message}`,
      url,
    );
  }

  if (response.status === 404) {
    console.debug(`Tool Shed search: ${url} returned 404 — treating as empty page`);
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
      `Tool Shed search request to ${url} failed: ${response.status} ${body.slice(0, 200)}`,
      url,
      response.status,
    );
  }

  const json: unknown = await response.json();
  try {
    return normalizeToolSearchResults(json);
  } catch (err) {
    throw new ToolFetchError(
      `Tool Shed search response from ${url} was malformed: ${(err as Error).message}`,
      url,
      response.status,
    );
  }
}

/**
 * Iterate Tool Shed search results page-by-page. Stops when the server
 * returns fewer hits than `pageSize` (or no hits at all).
 */
export async function* iterateToolSearchPages(
  toolshedUrl: string,
  query: string,
  opts: SearchToolsOptions = {},
): AsyncGenerator<SearchResults<ToolSearchHit>, void, void> {
  const pageSize = opts.pageSize ?? 10;
  let page = opts.page ?? 1;
  while (true) {
    const results = await searchTools(toolshedUrl, query, { ...opts, page, pageSize });
    yield results;
    if (results.hits.length < pageSize) return;
    page += 1;
  }
}
