# @galaxy-tool-util/search

## 1.1.0

### Patch Changes

- Updated dependencies [[`3b97a0f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3b97a0f41c2358aa663df4e6490488e89c9ba9e5)]:
  - @galaxy-tool-util/schema@1.1.0
  - @galaxy-tool-util/core@1.1.0

## 0.2.0

### Minor Changes

- [#63](https://github.com/jmchilton/galaxy-tool-util-ts/pull/63) [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941) Thanks [@jmchilton](https://github.com/jmchilton)! - New `@galaxy-tool-util/search` package (browser-safe). Surface:
  - `ToolSearchHit` / `SearchResults<A>` — plain TypeScript wire types mirroring Tool Shed `/api/tools?q=` JSON (snake_case).
  - `normalizeToolSearchResults(raw)` — coerces stringified pagination numbers (`total_results`, `page`, `page_size`) and shape-checks every hit, throwing a descriptive `Error` identifying the offending field on malformed input.
  - `searchTools(toolshedUrl, query, opts?)` — HTTP client around `/api/tools?q=`. `AbortSignal.timeout(30_000)`, `ToolFetchError` on network/HTTP/decode failure, 404 treated as empty page, query passed through verbatim (Tool Shed does its own wildcard wrapping server-side).
  - `iterateToolSearchPages(toolshedUrl, query, opts?)` — async generator; yields pages until the server returns fewer than `pageSize` hits.
  - `ToolSearchService` — fans queries across configured Tool Shed sources, dedupes mirrors by `(owner, repo, toolId)` (first source wins), sorts by server score, respects `maxResults`, and optionally enriches hits with `ParsedTool` via a shared `ToolInfoService`. Exposes `searchTools`, `getToolVersions`, `getLatestVersionForToolId`.
  - `NormalizedToolHit` — UI-facing camelCase hit shape with derived `trsToolId` and `fullToolId`.
  - Re-exports `ToolFetchError`, `getTRSToolVersions`, `getLatestTRSToolVersion`, and `TRSToolVersion` from `@galaxy-tool-util/core`.

  No result-ranking layer yet — server-side Whoosh BM25 is the sole ordering. A pure `rerank` helper may land in a future release if UX testing shows it's needed.

### Patch Changes

- Updated dependencies [[`afcd804`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/afcd804e03dacffd03821c3f75e2cae4a0340400), [`7b835d2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7b835d298c4863ac0573e9091f4b1b8c72c34fef), [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941), [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941), [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941)]:
  - @galaxy-tool-util/schema@1.0.0
  - @galaxy-tool-util/core@1.0.0
