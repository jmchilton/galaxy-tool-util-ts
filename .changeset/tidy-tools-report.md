---
"@galaxy-tool-util/core": patch
---

Bound tool-metadata decode diagnostics for both Tool Shed and Galaxy fetches.
Report the first failing field path, summarize type mismatches without rendering
schema declarations or invalid payloads, and cap the displayed URL and detail so
the complete message stays under 500 characters. The full URL remains available
on `ToolFetchError.url`.
