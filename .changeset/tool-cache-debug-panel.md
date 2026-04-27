---
"@galaxy-tool-util/core": minor
"@galaxy-tool-util/gxwf-web": minor
"@galaxy-tool-util/gxwf-client": minor
"@galaxy-tool-util/gxwf-ui": minor
---

Tool Cache debugging panel.

- `ToolCache.statCached(key)` — per-entry size/mtime (passthrough to `CacheStorage.stat`).
- `ToolInfoService.refetch(toolId, version?, {force?})` — idempotent populate (short-circuits on cache hit) / forced re-fetch. Returns `{cacheKey, fetched, alreadyCached}`. Backs the new web routes and any future inspector surfaces.
- `gxwf-web`: new `/api/tool-cache` routes — list (with `?decode=1` opt-in decode probe), stats, raw read, single + prefix delete, refetch, add. `AppState` now carries the full `ToolInfoService` (not just its cache) so refetch/add can drive the existing source-fallback logic.
- `gxwf-client` regenerated to expose the new schemas.
- `gxwf-ui`: new "Tool Cache" navbar tab with stats strip, filterable table (search / source dropdown / undecodable-only), per-row view-raw / refetch / open-toolshed / delete, and overflow menu (Add tool…, Clear by prefix…, Clear all). Decode-probe flags malformed payloads.
