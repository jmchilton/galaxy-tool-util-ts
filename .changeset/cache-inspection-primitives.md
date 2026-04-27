---
"@galaxy-tool-util/core": minor
---

Add cache-inspection primitives on `ToolCache` and `CacheStorage`:

- `ToolCache.removeCached(key)` — delete a single cached entry by cache key.
- `ToolCache.loadCachedRaw(key)` — read the raw cached payload without `ParsedTool` decoding, for inspecting stale or partial entries.
- `ToolCache.getCacheStats()` — aggregate counts, total bytes, source breakdown, and oldest/newest timestamps.
- Optional `CacheStorage.stat?(key)` — per-entry size (and mtime on filesystem). Implemented on `FilesystemCacheStorage` and `IndexedDBCacheStorage`.
- Lazy-index backfill in `loadCached` now records the version off the decoded `ParsedTool` and tags the source as `"orphan"` so reconstructed entries are flagged.
