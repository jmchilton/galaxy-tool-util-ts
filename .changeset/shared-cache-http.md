---
"@galaxy-tool-util/core": minor
"@galaxy-tool-util/schema": minor
---

Shared cache-HTTP layer (Phase 1 of merged cache UI plan).

- `@galaxy-tool-util/schema`: GA4GH TRS Effect Schemas — `TrsTool`, `TrsToolVersion`, `TrsToolClass`, `TrsChecksum`, `TrsImageData`, enums (`TrsImageType`, `TrsDescriptorType`, `TrsFileType`). Plus `GALAXY_TOOL_CLASS` default for Galaxy-shaped TRS responses.
- `@galaxy-tool-util/core/cache-http`: framework-agnostic handlers + DTOs consumed by `gxwf-web` and `tool-cache-proxy`. Read namespace (`searchTools`, `trsListTools`, `trsGetTool`, `trsListVersions`, `getParsedTool`, `getParameterSchema`, `getToolSource`) and admin namespace (`listCache`, `cacheStats`, `getCacheRaw`, `deleteCacheEntry`, `clearCache`, `refetchTool`, `addTool`). `HttpError` class + `cacheToTrs` helper (normalizes readable cache `tool_id` to TRS form).
