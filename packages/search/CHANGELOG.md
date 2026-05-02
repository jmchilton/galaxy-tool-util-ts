# @galaxy-tool-util/search

## 1.2.0

### Patch Changes

- Updated dependencies [[`0826f95`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0826f95e1c05005860c0e45a9794d8bad068d51d), [`6fec560`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/6fec560edbc19b1ba4d535bd64610efcc3d904b0), [`8261f8d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8261f8d95040ad76a053ce3bf5048de53c41dda9), [`0124600`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0124600f0cd42210f20989c6626ece034d13dfe5), [`016385b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/016385bb0e40a9cbe1f6c55d9d18829917914df0), [`8cfbe32`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8cfbe327f69ce09578ac49c3eff39282ba66c7fc), [`86af88e`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/86af88e0162bbff6d1941f6556e2edd0070a0321)]:
  - @galaxy-tool-util/core@1.2.0
  - @galaxy-tool-util/schema@1.2.0

## 1.1.0

### Minor Changes

- [#72](https://github.com/jmchilton/galaxy-tool-util-ts/pull/72) [`54a9f93`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54a9f939ee25195b804cb7b2ed1e598cad97b5ca) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `gxwf tool-revisions <tool-id>` for resolving a Tool Shed tool to the
  changeset revisions that publish it — needed for emitting workflows pinned
  on `(name, owner, changeset_revision)` for reproducible reinstall.
  - Accepts both `owner~repo~tool_id` and `owner/repo/tool_id` forms.
  - `--tool-version <v>` restricts to revisions that publish that exact tool
    version.
  - `--latest` prints only the newest matching revision (per
    `get_ordered_installable_revisions` order).
  - `--json` emits `{ trsToolId, version?, revisions: [{ changesetRevision,
toolVersion }] }`. Exit codes: `0` on hits, `2` on empty, `3` on fetch
    error.

  Exports `getToolRevisions(toolshedUrl, { owner, repo, toolId, version? })`
  from `@galaxy-tool-util/search` for non-CLI consumers. Implementation uses
  the 3-call dance over `/api/repositories?owner=…&name=…`,
  `/api/repositories/{id}/metadata?downloadable_only=true`, and
  `get_ordered_installable_revisions` — no Tool Shed change required.

- [#72](https://github.com/jmchilton/galaxy-tool-util-ts/pull/72) [`944d671`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/944d6719028566e0a3231bc76cb603ed9fd03346) Thanks [@jmchilton](https://github.com/jmchilton)! - Tool Shed discovery quality-of-life improvements.

  `gxwf tool-search` gains client-side `--owner <user>` and `--match-name`
  filters (the Tool Shed has no server-side `owner:` keyword on
  `/api/tools`), plus a `--page <n>` flag to start paging beyond page 1.

  `gxwf tool-search --enrich` resolves each hit's `ParsedTool` via the
  shared tool-info cache and inlines it as `parsedTool` on each JSON hit,
  so skills that pick the top 1–3 results can skip the follow-up
  `galaxy-tool-cache add` round trip. Off by default; one fetch per hit.

  New `gxwf repo-search <query>` command queries `/api/repositories?q=`
  with server-side `owner:` / `category:` reserved keywords. Repository
  search ranks by popularity (`times_downloaded`) and is better suited
  for "find me a package about X" queries; tool-search remains the
  right tool for exact tool-name lookups.

  Exports `searchRepositories`, `iterateRepoSearchPages`, and
  `buildRepoQuery` from `@galaxy-tool-util/search` for non-CLI consumers,
  along with the `RepositorySearchHit` wire type and
  `normalizeRepoSearchResults` validator.

- [#67](https://github.com/jmchilton/galaxy-tool-util-ts/pull/67) [`25104d3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/25104d395f17ed6e84cc7a214fb193349e5141f8) Thanks [@jmchilton](https://github.com/jmchilton)! - Add Tool Shed discovery commands to `gxwf`:
  - `gxwf tool-search <query>` — search the Tool Shed (`toolshed.g2.bx.psu.edu`).
    Prints a tabular listing by default; `--json` emits a `{ query, hits }`
    envelope. Exit codes: `0` on hits, `2` on empty, `3` on fetch error.
  - `gxwf tool-versions <tool-id>` — list TRS-published versions (newest last),
    accepting both `owner~repo~tool_id` and `owner/repo/tool_id` forms.
    `--latest` prints only the latest version. Same exit-code convention.

  Exports `normalizeHit` from `@galaxy-tool-util/search` so single-source
  callers can paginate with `iterateToolSearchPages` and normalize hits
  without instantiating `ToolSearchService`.

### Patch Changes

- Updated dependencies [[`3b97a0f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3b97a0f41c2358aa663df4e6490488e89c9ba9e5), [`11a6625`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/11a66254a6c1c2640954ab4fbc41c59b0add0617)]:
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
