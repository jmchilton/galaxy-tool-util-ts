---
"@galaxy-tool-util/core": minor
"@galaxy-tool-util/cache-ui": minor
"@galaxy-tool-util/gxwf-web": minor
"@galaxy-tool-util/tool-cache-proxy": minor
"@galaxy-tool-util/gxwf-client": patch
---

Implement lazy wrapper-source fetching and caching from Tool Shed and Galaxy endpoints. Serve UTF-8 source text with language and macro-expansion headers, enable the Source tab in server and browser cache inspectors, and invalidate stored source when refetching or deleting a cache entry. Tool Shed XML is expanded and selected by wrapper version; exact changesets and original macro files remain outside this API.
