# @galaxy-tool-util/cache-ui

## 0.2.2

### Patch Changes

- Updated dependencies []:
  - @galaxy-tool-util/tool-cache-proxy@1.13.1

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @galaxy-tool-util/tool-cache-proxy@1.13.0

## 0.2.0

### Minor Changes

- [#176](https://github.com/jmchilton/galaxy-tool-util-ts/pull/176) [`54f0d61`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54f0d61642a768d531027f9a174322b8259a9db8) Thanks [@jmchilton](https://github.com/jmchilton)! - Extract the Tool Cache panel into a shared package (Phase 4 of merged cache UI plan).
  - New `@galaxy-tool-util/cache-ui` package: `ToolCacheView`, `ToolCacheTable`, `ToolCacheStats`, `ToolCacheRawDialog`, `useToolCache`, and `createCacheClient(baseUrl)`. The composable takes a `CacheClient` directly — no module-level singleton.
  - Compile-time types are sourced from the `tool-cache-proxy` OpenAPI spec; both servers implement the surface identically so a `CacheClient` works against either.
  - `gxwf-ui` consumes `cache-ui` and removes its local copies of the four cache components, the `useToolCache` composable, and the cache view (now a thin wrapper that builds a client and mounts `<ToolCacheView>`).
  - `tool-cache-proxy` re-exports its generated `paths` / `components` / `operations` types and renames the delete path parameter from `cache_key` to `cacheKey` to match `gxwf-web`.

- [#176](https://github.com/jmchilton/galaxy-tool-util-ts/pull/176) [`d2e8574`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d2e8574c1bc615dbeea28e01c3a1a644b3638694) Thanks [@jmchilton](https://github.com/jmchilton)! - Implement lazy wrapper-source fetching and caching from Tool Shed and Galaxy endpoints. Serve UTF-8 source text with language and macro-expansion headers, enable the Source tab in server and browser cache inspectors, and invalidate stored source when refetching or deleting a cache entry. Tool Shed XML is expanded and selected by wrapper version; exact changesets and original macro files remain outside this API.

### Patch Changes

- [#176](https://github.com/jmchilton/galaxy-tool-util-ts/pull/176) [`cf74f73`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/cf74f73838d9c412d03d4638cbb14509c1cea6bc) Thanks [@jmchilton](https://github.com/jmchilton)! - Ship the tool-cache-proxy SPA (Phase 5 of merged cache UI plan).
  - New private `@galaxy-tool-util/tool-cache-proxy-ui` package: minimal Vite + Vue 3 SPA wrapping `@galaxy-tool-util/cache-ui`'s `<ToolCacheView>`. Mounts at `/`, no nav shell.
  - `tool-cache-proxy` serves the bundled SPA as a static-file fallback for non-API GETs when `uiDir` is set on the `ProxyContext`. The bin auto-discovers `../public` (populated by `pnpm copy-ui`) and respects a `GALAXY_TOOL_PROXY_UI_DIST` env override.
  - New `cache-ui/cache-ui.css` ships sane defaults for the `--gx-*` design tokens the components reference; consumers that already define them (e.g. `gxwf-ui`) can skip the import.
  - Root `pnpm build` now copies the SPA dist into `tool-cache-proxy/public/` after the workspace build.

- Updated dependencies [[`54f0d61`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54f0d61642a768d531027f9a174322b8259a9db8), [`40fd346`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/40fd3461601b890a6ccf08a6c69f3d739257c4cc), [`cf74f73`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/cf74f73838d9c412d03d4638cbb14509c1cea6bc), [`45741b0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/45741b0db3b6eeada5a53ba57c6af4cfd8f352f7), [`3a0a04d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3a0a04d39eaa2f7bee1862d287feab7047c1760c), [`d2e8574`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d2e8574c1bc615dbeea28e01c3a1a644b3638694)]:
  - @galaxy-tool-util/tool-cache-proxy@1.12.0
