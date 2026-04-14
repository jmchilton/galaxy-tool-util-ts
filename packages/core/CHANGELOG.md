# @galaxy-tool-util/core

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
