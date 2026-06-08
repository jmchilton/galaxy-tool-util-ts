# @galaxy-tool-util/core

## 1.7.0

### Patch Changes

- Updated dependencies [[`d51a18b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d51a18b2f19ce5d3cce8fe8b6a4ff0053ac2af60), [`455fdcb`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/455fdcbcf8eaa6060f45dec9f4fbabd138252673), [`38ff7d2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/38ff7d2f235a34f81785768dd5299d8e1fbe76a1), [`8afd4d0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8afd4d064180231bdba0b386746deb48da44eeb8), [`0f36639`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0f36639ea065bb330c24c512224fb5e1ae74187e)]:
  - @galaxy-tool-util/schema@1.7.0

## 1.6.0

### Patch Changes

- Updated dependencies [[`ac53ba0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ac53ba0e0f38979dc70fc83763fa1f1c5ba8d5ec), [`ac53ba0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ac53ba0e0f38979dc70fc83763fa1f1c5ba8d5ec)]:
  - @galaxy-tool-util/schema@1.6.0

## 1.5.0

### Patch Changes

- [#103](https://github.com/jmchilton/galaxy-tool-util-ts/pull/103) [`9053be9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9053be9e54a8095bb950d1e57cd6b95134ec3578) Thanks [@jmchilton](https://github.com/jmchilton)! - Inline UDT resolver for connection validation (jmchilton/galaxy-tool-util-ts#101). Also refreshes the parsed_tools/ fixture cache to pick up new ParsedTool fields (`requirements`, `containers`, `stdio`) added upstream — incidental to this PR; the TS-side `ParsedTool` schema ignores them. TS port of Galaxy's `_inline_tool` module on the `wf_tool_state` branch: `@galaxy-tool-util/schema` now ships `parseInlineTool(repr)` (full port of `parse_tool(YamlToolSource(repr))` covering id/version/name/description, inputs, outputs, citations, license, profile, edam, xrefs, help). `@galaxy-tool-util/connection-validation` ships `resolveForStep`, `InlineResolver`, `ensureInlineResolver`, and `collectInlineTools`; `buildWorkflowGraph` wraps its resolver in an `InlineResolver` so inline `tool_representation` steps (with `class: GalaxyUserTool`) resolve without a remote lookup. `buildGetToolInfo` walks inline reps up-front and pre-parses them into the cache, surfacing parse errors via `onMiss` alongside ToolShed misses. Unblocks UDT fixtures in the connection-validation corpus (eight new fixtures pulled byte-identical from Galaxy's `wf_tool_state` branch).

- Updated dependencies [[`fcef54f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/fcef54fdc27d228040ae45aeec7019f32368e344), [`b8e61b0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b8e61b0e1908149a683e1c9b86876346e3ad325d), [`cda837c`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/cda837cbe95a64654c088c299bd2e6cb812dd7dd), [`44a437c`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/44a437c214b4de7947e6f3e0cbe8d5262b510451), [`001ded9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/001ded9a4cbe7f2a2ce3838ed4ee480bba8ad2a9), [`527b8b8`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/527b8b88e812219ae0a9965a4b3090d9c902575a), [`f63f210`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/f63f21094f24bacc36d9c18cd634c8790f285c57), [`1d53e62`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/1d53e628e4a1a6e771e090897194f72391087b2b), [`5b0b3be`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/5b0b3bed3892c965263b30e00b87e0d7140f34e3), [`9053be9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9053be9e54a8095bb950d1e57cd6b95134ec3578), [`f9e4ede`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/f9e4ede76a5e9353dd60009e3d5aa7523cd232fe), [`e4e46e0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e4e46e0e4625532363c2d10b9c3beeaa03d05ed4), [`22a982b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/22a982b28b1e028192cd892c96a629cb7112c7be), [`2bdd932`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/2bdd932e8dc0acc1010f94493fa7fbc7d2a4a16d), [`941ac0e`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/941ac0e3b373521db8814003cc9dcf5a7bb9115f), [`62dc8a7`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/62dc8a71ba284022e2be5bf607fcead523df0370), [`ae33d9d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ae33d9d6de39475e2646f2d8790ada7d12cfd676)]:
  - @galaxy-tool-util/schema@1.5.0

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

- Updated dependencies [[`8261f8d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8261f8d95040ad76a053ce3bf5048de53c41dda9), [`0124600`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0124600f0cd42210f20989c6626ece034d13dfe5), [`016385b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/016385bb0e40a9cbe1f6c55d9d18829917914df0), [`8cfbe32`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8cfbe327f69ce09578ac49c3eff39282ba66c7fc), [`ee543b5`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ee543b522c9181f0920969746e271e986fea3249)]:
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
