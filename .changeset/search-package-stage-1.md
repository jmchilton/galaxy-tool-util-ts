---
"@galaxy-tool-util/search": minor
---

New `@galaxy-tool-util/search` package (browser-safe). Surface:

- `ToolSearchHit` / `SearchResults<A>` — plain TypeScript wire types mirroring Tool Shed `/api/tools?q=` JSON (snake_case).
- `normalizeToolSearchResults(raw)` — coerces stringified pagination numbers (`total_results`, `page`, `page_size`) and shape-checks every hit, throwing a descriptive `Error` identifying the offending field on malformed input.
- `searchTools(toolshedUrl, query, opts?)` — HTTP client around `/api/tools?q=`. `AbortSignal.timeout(30_000)`, `ToolFetchError` on network/HTTP/decode failure, 404 treated as empty page, query passed through verbatim (Tool Shed does its own wildcard wrapping server-side).
- `iterateToolSearchPages(toolshedUrl, query, opts?)` — async generator; yields pages until the server returns fewer than `pageSize` hits.
- `ToolSearchService` — fans queries across configured Tool Shed sources, dedupes mirrors by `(owner, repo, toolId)` (first source wins), sorts by server score, respects `maxResults`, and optionally enriches hits with `ParsedTool` via a shared `ToolInfoService`. Exposes `searchTools`, `getToolVersions`, `getLatestVersionForToolId`.
- `NormalizedToolHit` — UI-facing camelCase hit shape with derived `trsToolId` and `fullToolId`.
- Re-exports `ToolFetchError`, `getTRSToolVersions`, `getLatestTRSToolVersion`, and `TRSToolVersion` from `@galaxy-tool-util/core`.

No result-ranking layer yet — server-side Whoosh BM25 is the sole ordering. A pure `rerank` helper may land in a future release if UX testing shows it's needed.
