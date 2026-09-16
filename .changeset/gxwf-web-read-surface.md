---
"@galaxy-tool-util/gxwf-web": minor
"@galaxy-tool-util/gxwf-ui": minor
---

Migrate `gxwf-web` cache surface to shared handlers (Phase 3 of merged cache UI plan).

- Added GA4GH TRS read surface: `GET /api/ga4gh/trs/v2/tools[/{tool_id}[/versions]]`.
- Added `GET /api/tools` search (`q` / `page` / `page_size`).
- Added `GET /api/tools/{id}/versions/{ver}` (parsed tool), three concrete `parameter_*_schema` endpoints, and `tool_source` (501).
- Router now thin-wraps shared handlers in `@galaxy-tool-util/core/cache-http`; `tool-cache.ts` removed.
- `ToolCacheRawDialog` rewritten as a tabbed dialog addressing entries by `(tool_id, tool_version)` — tabs for parameter model, request schema, landing-request schema, test-case XML schema, and tool source (disabled).
