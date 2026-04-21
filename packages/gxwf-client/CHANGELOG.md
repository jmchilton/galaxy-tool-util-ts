# @galaxy-tool-util/gxwf-client

## 0.3.0

### Minor Changes

- [#37](https://github.com/jmchilton/galaxy-tool-util-ts/pull/37) [`7d7e93d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7d7e93d254b8ab440504fcb3ae7b5667505bf0dc) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `@galaxy-tool-util/gxwf-client` package: typed HTTP client for gxwf-web using `openapi-fetch` typed against the generated `paths` from `@galaxy-tool-util/gxwf-web`. Exports `createGxwfClient(baseUrl, options?)` and re-exports `paths`, `components`, `operations`, `GxwfClient`.

- [#49](https://github.com/jmchilton/galaxy-tool-util-ts/pull/49) [`1af1f7d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/1af1f7dc3a84297c3d81bcf195781e7c010a6a0e) Thanks [@jmchilton](https://github.com/jmchilton)! - Mutating workflow ops + export/convert UI. Schema adds `ExportResult` / `ConvertResult` / `WorkflowSourceFormat`. Report shell adds `ExportReport.vue` and routes `"export"`/`"convert"` report types. UI switches workflow ops to POST, adds dry_run toggle on Clean, Export and Convert tabs with destructive-op confirmation and post-mutation workflow list refresh; Convert navigates back to the dashboard after removing the source. gxwf-client tests exercise POST export/convert and dry_run semantics.

### Patch Changes

- Updated dependencies [[`b5a6e57`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b5a6e57b26aa926ca5bf18b36f63d80bad9e90df), [`b5a6e57`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b5a6e57b26aa926ca5bf18b36f63d80bad9e90df), [`4fcaa2b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/4fcaa2b957aed4943b9ca527d6ebd6c0c88e989a), [`1af1f7d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/1af1f7dc3a84297c3d81bcf195781e7c010a6a0e), [`d0c9888`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d0c9888891e236e233c271c8788c9055ae69506b), [`c4df435`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/c4df4357af969557d5eab783f5baae11ee617ef1), [`0124aac`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0124aac556b94f575fddd86a91eaff923933fec1), [`54fc8f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54fc8f20720030cdbf690fd6e72066d7958fc9b5), [`6c406cb`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/6c406cb30215ab61fdb5b8d1661727f188bcf7cd), [`b5a6e57`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b5a6e57b26aa926ca5bf18b36f63d80bad9e90df)]:
  - @galaxy-tool-util/gxwf-web@0.3.0
