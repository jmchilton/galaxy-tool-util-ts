---
"@galaxy-tool-util/core": patch
"@galaxy-tool-util/gxwf-web": patch
---

Drop the unused `getCacheRaw` handler and `RawResponse` DTO from `@galaxy-tool-util/core`.

The handler was exported and unit-tested but no router wired it — the merged cache UI plan (§3) replaced cacheKey-addressed raw reads with `(tool_id, tool_version)` reads via `parameter_*_schema` and `tool_source`. Removing dead surface area; `loadCachedRaw` on the cache itself is unchanged.
