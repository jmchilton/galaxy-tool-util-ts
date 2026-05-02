# @galaxy-tool-util/core

## 1.2.0

### Minor Changes

- [#78](https://github.com/jmchilton/galaxy-tool-util-ts/pull/78) [`0826f95`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0826f95e1c05005860c0e45a9794d8bad068d51d) Thanks [@jmchilton](https://github.com/jmchilton)! - Add cache-inspection primitives on `ToolCache` and `CacheStorage`:
  - `ToolCache.removeCached(key)` — delete a single cached entry by cache key.
  - `ToolCache.loadCachedRaw(key)` — read the raw cached payload without `ParsedTool` decoding, for inspecting stale or partial entries.
  - `ToolCache.getCacheStats()` — aggregate counts, total bytes, source breakdown, and oldest/newest timestamps.
  - Optional `CacheStorage.stat?(key)` — per-entry size (and mtime on filesystem). Implemented on `FilesystemCacheStorage` and `IndexedDBCacheStorage`.
  - Lazy-index backfill in `loadCached` now records the version off the decoded `ParsedTool` and tags the source as `"orphan"` so reconstructed entries are flagged.

- [#81](https://github.com/jmchilton/galaxy-tool-util-ts/pull/81) [`86af88e`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/86af88e0162bbff6d1941f6556e2edd0070a0321) Thanks [@jmchilton](https://github.com/jmchilton)! - Tool Cache debugging panel.
  - `ToolCache.statCached(key)` — per-entry size/mtime (passthrough to `CacheStorage.stat`).
  - `ToolInfoService.refetch(toolId, version?, {force?})` — idempotent populate (short-circuits on cache hit) / forced re-fetch. Returns `{cacheKey, fetched, alreadyCached}`. Backs the new web routes and any future inspector surfaces.
  - `gxwf-web`: new `/api/tool-cache` routes — list (with `?decode=1` opt-in decode probe), stats, raw read, single + prefix delete, refetch, add. `AppState` now carries the full `ToolInfoService` (not just its cache) so refetch/add can drive the existing source-fallback logic.
  - `gxwf-client` regenerated to expose the new schemas.
  - `gxwf-ui`: new "Tool Cache" navbar tab with stats strip, filterable table (search / source dropdown / undecodable-only), per-row view-raw / refetch / open-toolshed / delete, and overflow menu (Add tool…, Clear by prefix…, Clear all). Decode-probe flags malformed payloads.

### Patch Changes

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`6fec560`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/6fec560edbc19b1ba4d535bd64610efcc3d904b0) Thanks [@jmchilton](https://github.com/jmchilton)! - Respect explicit empty tool source lists as cache-only lookup.

- Updated dependencies [[`8261f8d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8261f8d95040ad76a053ce3bf5048de53c41dda9), [`0124600`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0124600f0cd42210f20989c6626ece034d13dfe5), [`016385b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/016385bb0e40a9cbe1f6c55d9d18829917914df0), [`8cfbe32`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8cfbe327f69ce09578ac49c3eff39282ba66c7fc)]:
  - @galaxy-tool-util/schema@1.2.0

## 1.1.0

### Patch Changes

- Updated dependencies [[`3b97a0f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3b97a0f41c2358aa663df4e6490488e89c9ba9e5), [`11a6625`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/11a66254a6c1c2640954ab4fbc41c59b0add0617)]:
  - @galaxy-tool-util/schema@1.1.0

## 1.0.0

### Major Changes

- [#63](https://github.com/jmchilton/galaxy-tool-util-ts/pull/63) [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941) Thanks [@jmchilton](https://github.com/jmchilton)! - TRS tool-version queries, version-optional `getToolInfo`, and `ParsedTool` model relocation.
  - New exports: `getTRSToolVersions(toolshedUrl, trsToolId, fetcher?)` and `getLatestTRSToolVersion(toolshedUrl, trsToolId, fetcher?)` (from `./client/trs.ts`), plus the `TRSToolVersion` type. These live in `core` because TRS metadata queries are a cross-cutting concern, not search-specific.
  - `ToolInfoService.getToolInfo` now resolves the latest TRS version when the caller omits one, instead of throwing. Still throws only when TRS itself returns no versions for the tool.
  - **Breaking:** `ParsedTool`, `HelpContent`, `XrefDict`, and `Citation` Effect Schemas no longer live in `core`. They have moved to `@galaxy-tool-util/schema` (`import { ParsedTool } from "@galaxy-tool-util/schema"`). This reflects the correct separation: `schema` owns data models, `core` owns IO/caching/services. Core now depends on `@galaxy-tool-util/schema`.

### Patch Changes

- Updated dependencies [[`afcd804`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/afcd804e03dacffd03821c3f75e2cae4a0340400), [`7b835d2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7b835d298c4863ac0573e9091f4b1b8c72c34fef), [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941), [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941)]:
  - @galaxy-tool-util/schema@1.0.0

## 0.3.0

### Minor Changes

- [#47](https://github.com/jmchilton/galaxy-tool-util-ts/pull/47) [`ac820d3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ac820d3d0b9f8ca798fd04d55aa18f61a7f970c9) Thanks [@jmchilton](https://github.com/jmchilton)! - Add pluggable `CacheStorage` interface with `FilesystemCacheStorage` (Node.js) and `IndexedDBCacheStorage` (browser/Web Worker) implementations. Replace `node:crypto` with Web Crypto API in `cacheKey()`. Enables `ToolCache` and `CacheIndex` to run in browser contexts (VS Code web extension language servers). Closes [#44](https://github.com/jmchilton/galaxy-tool-util-ts/issues/44).

- [#52](https://github.com/jmchilton/galaxy-tool-util-ts/pull/52) [`32fc546`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/32fc54687b7d674751b425768b424ba4c04a25f3) Thanks [@jmchilton](https://github.com/jmchilton)! - Split into browser-safe universal entry and Node-only `/node` subpath.

  **Breaking (pre-1.0):** `FilesystemCacheStorage`, `getCacheDir`, `DEFAULT_CACHE_DIR`, `CACHE_DIR_ENV_VAR`, and `loadWorkflowToolConfig` moved from the root export to `@galaxy-tool-util/core/node`. `ToolCache`'s constructor now requires `storage` — the implicit filesystem fallback is gone. Node callers should use `makeNodeToolCache` / `makeNodeToolInfoService` from `/node` for the default filesystem-backed setup.

  The universal entry (`@galaxy-tool-util/core`) is now free of `node:*` imports and top-level Node side effects, so browser bundlers (esbuild `platform:"browser"`, Vite) no longer need shim plugins to consume it. Enforced by `publint`, `@arethetypeswrong/cli`, an esbuild metafile smoke test, and an ESLint `no-restricted-imports` guard.

  Adds `"sideEffects": false` and a `"browser"` condition on the root export.

## 0.2.0

### Minor Changes

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `populate-workflow` and `structural-schema` commands to `galaxy-tool-cache` CLI. Add async external reference resolution for workflow imports supporting URL, base64, TRS, Galaxy @import, and file path strategies with cycle detection and depth limiting.
