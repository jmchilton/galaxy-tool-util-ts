---
"@galaxy-tool-util/core": minor
"@galaxy-tool-util/gxwf-web": patch
"@galaxy-tool-util/tool-cache-proxy": patch
---

Move the cache HTTP route table into `@galaxy-tool-util/core/cache-http`.

Both `gxwf-web` and `tool-cache-proxy` now import `matchCacheRoute` and `dispatchCacheRoute` from core. URL parsing for the read surface (`/api/tools`, `/api/ga4gh/trs/v2/tools/...`, `/api/tools/{id}/versions/{ver}/...`) and the admin namespace (`/api/tool-cache/...`) lives in one place — neither server can drift on path shape, query parameter handling, or the parameter-schema tail dispatch. Each adapter shrinks ~80 lines; route contract is now a single source of truth.
