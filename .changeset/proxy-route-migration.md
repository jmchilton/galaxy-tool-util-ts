---
"@galaxy-tool-util/tool-cache-proxy": minor
---

Reshape `tool-cache-proxy` HTTP surface (Phase 2 of merged cache UI plan).

- `GET /api/tools` now returns search results (`q` / `page` / `page_size`) instead of a cache listing.
- Added GA4GH TRS read surface: `GET /api/ga4gh/trs/v2/tools[/{tool_id}[/versions]]`.
- Replaced `GET /api/tools/{id}/versions/{ver}/schema?representation=` with three concrete endpoints: `parameter_request_schema`, `parameter_landing_request_schema`, `parameter_test_case_xml_schema`.
- Added `GET /api/tools/{id}/versions/{ver}/tool_source` (returns 501 until cache stores source).
- Added admin namespace `/api/tool-cache/*` (list, stats, delete-by-key, prefix-clear, refetch, add) — symmetric with `gxwf-web`.
- Dropped legacy `DELETE /api/tools/cache` (use `DELETE /api/tool-cache` instead).
- Router now thin-wraps shared handlers in `@galaxy-tool-util/core/cache-http`.
- Ships `openapi.json` + `codegen` script that emits `src/generated/api-types.ts`.
