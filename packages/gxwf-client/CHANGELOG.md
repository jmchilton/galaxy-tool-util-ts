# @galaxy-tool-util/gxwf-client

## 1.2.0

### Minor Changes

- [#81](https://github.com/jmchilton/galaxy-tool-util-ts/pull/81) [`86af88e`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/86af88e0162bbff6d1941f6556e2edd0070a0321) Thanks [@jmchilton](https://github.com/jmchilton)! - Tool Cache debugging panel.
  - `ToolCache.statCached(key)` — per-entry size/mtime (passthrough to `CacheStorage.stat`).
  - `ToolInfoService.refetch(toolId, version?, {force?})` — idempotent populate (short-circuits on cache hit) / forced re-fetch. Returns `{cacheKey, fetched, alreadyCached}`. Backs the new web routes and any future inspector surfaces.
  - `gxwf-web`: new `/api/tool-cache` routes — list (with `?decode=1` opt-in decode probe), stats, raw read, single + prefix delete, refetch, add. `AppState` now carries the full `ToolInfoService` (not just its cache) so refetch/add can drive the existing source-fallback logic.
  - `gxwf-client` regenerated to expose the new schemas.
  - `gxwf-ui`: new "Tool Cache" navbar tab with stats strip, filterable table (search / source dropdown / undecodable-only), per-row view-raw / refetch / open-toolshed / delete, and overflow menu (Add tool…, Clear by prefix…, Clear all). Decode-probe flags malformed payloads.

### Patch Changes

- Updated dependencies [[`da95cb0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/da95cb08da77ada269ca690339cdba04d1de1343), [`673948b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/673948b7629bbe8a698b3eb1b49c44177415eeab), [`86af88e`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/86af88e0162bbff6d1941f6556e2edd0070a0321)]:
  - @galaxy-tool-util/gxwf-web@1.2.0

## 1.1.0

### Patch Changes

- Updated dependencies [[`3b97a0f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3b97a0f41c2358aa663df4e6490488e89c9ba9e5)]:
  - @galaxy-tool-util/gxwf-web@1.1.0

## 1.0.0

### Patch Changes

- Updated dependencies []:
  - @galaxy-tool-util/gxwf-web@1.0.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @galaxy-tool-util/gxwf-web@0.4.0

## 0.3.0

### Minor Changes

- [#37](https://github.com/jmchilton/galaxy-tool-util-ts/pull/37) [`7d7e93d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7d7e93d254b8ab440504fcb3ae7b5667505bf0dc) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `@galaxy-tool-util/gxwf-client` package: typed HTTP client for gxwf-web using `openapi-fetch` typed against the generated `paths` from `@galaxy-tool-util/gxwf-web`. Exports `createGxwfClient(baseUrl, options?)` and re-exports `paths`, `components`, `operations`, `GxwfClient`.

- [#49](https://github.com/jmchilton/galaxy-tool-util-ts/pull/49) [`1af1f7d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/1af1f7dc3a84297c3d81bcf195781e7c010a6a0e) Thanks [@jmchilton](https://github.com/jmchilton)! - Mutating workflow ops + export/convert UI. Schema adds `ExportResult` / `ConvertResult` / `WorkflowSourceFormat`. Report shell adds `ExportReport.vue` and routes `"export"`/`"convert"` report types. UI switches workflow ops to POST, adds dry_run toggle on Clean, Export and Convert tabs with destructive-op confirmation and post-mutation workflow list refresh; Convert navigates back to the dashboard after removing the source. gxwf-client tests exercise POST export/convert and dry_run semantics.

### Patch Changes

- Updated dependencies [[`b5a6e57`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b5a6e57b26aa926ca5bf18b36f63d80bad9e90df), [`b5a6e57`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b5a6e57b26aa926ca5bf18b36f63d80bad9e90df), [`4fcaa2b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/4fcaa2b957aed4943b9ca527d6ebd6c0c88e989a), [`1af1f7d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/1af1f7dc3a84297c3d81bcf195781e7c010a6a0e), [`d0c9888`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d0c9888891e236e233c271c8788c9055ae69506b), [`c4df435`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/c4df4357af969557d5eab783f5baae11ee617ef1), [`0124aac`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0124aac556b94f575fddd86a91eaff923933fec1), [`54fc8f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54fc8f20720030cdbf690fd6e72066d7958fc9b5), [`6c406cb`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/6c406cb30215ab61fdb5b8d1661727f188bcf7cd), [`b5a6e57`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b5a6e57b26aa926ca5bf18b36f63d80bad9e90df)]:
  - @galaxy-tool-util/gxwf-web@0.3.0
