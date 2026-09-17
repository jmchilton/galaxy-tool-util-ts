---
"@galaxy-tool-util/cache-ui": minor
"@galaxy-tool-util/gxwf-ui": minor
"@galaxy-tool-util/tool-cache-proxy": patch
---

Extract the Tool Cache panel into a shared package (Phase 4 of merged cache UI plan).

- New `@galaxy-tool-util/cache-ui` package: `ToolCacheView`, `ToolCacheTable`, `ToolCacheStats`, `ToolCacheRawDialog`, `useToolCache`, and `createCacheClient(baseUrl)`. The composable takes a `CacheClient` directly — no module-level singleton.
- Compile-time types are sourced from the `tool-cache-proxy` OpenAPI spec; both servers implement the surface identically so a `CacheClient` works against either.
- `gxwf-ui` consumes `cache-ui` and removes its local copies of the four cache components, the `useToolCache` composable, and the cache view (now a thin wrapper that builds a client and mounts `<ToolCacheView>`).
- `tool-cache-proxy` re-exports its generated `paths` / `components` / `operations` types and renames the delete path parameter from `cache_key` to `cacheKey` to match `gxwf-web`.
