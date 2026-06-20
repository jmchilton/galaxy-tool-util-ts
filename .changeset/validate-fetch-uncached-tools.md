---
"@galaxy-tool-util/cli": minor
"@galaxy-tool-util/core": minor
---

feat(validate): fetch uncached tools during tool-state validation (default on)

`gxwf validate` and `gxwf draft-validate --concrete` previously read only the
local tool cache: any tool not already added via `galaxy-tool-cache add` was
reported `skipped — not in cache`, so its `tool_state` went unchecked. They now
fetch missing tools from the ToolShed (and an optional `--galaxy-url` Galaxy
instance) on a cache miss, cache them, and validate against the real tool — so a
fresh cache validates every step instead of silently skipping.

Pass `--offline` to keep the old behavior (read-only cache; uncached tools are
skipped). `--galaxy-url <url>` adds a Galaxy instance as a fallback source after
the ToolShed.

The lower-level `validateNativeSteps` / `validateFormat2Steps` stay offline by
default — fetching only happens when an explicit `ToolInfoService` is supplied —
so callers that pass only a cache are unaffected.

Core gains two methods that keep cache-key derivation in one place:
`ToolInfoService.resolveTool(toolId, version)` returns the fetched tool together
with the authoritative cache key it was stored under (`getToolInfo` is now a thin
projection of it), and `ToolCache.loadByToolId(toolId, version)` is the canonical
network-free "is this cached?" read. The CLI tool resolver consumes these instead
of re-deriving keys, so an online fetch can no longer return a key that points at
a different cache entry than the one written.
