---
"@galaxy-tool-util/gxwf-ui": minor
---

`useClientToolCache` composable — browser-side peer of `useToolCache` that
mirrors the same reactive surface (`{ entries, stats, loading, error,
refresh, loadRaw, del, clear, refetch, add }`) but talks directly to the
singleton `useToolInfoService()` cache instead of the `gxwf-web`
`/api/tool-cache` REST surface. Existing `ToolCacheTable`, `ToolCacheStats`,
and `ToolCacheRawDialog` components render unchanged against either
backend.

The `/cache` view gains a transport selector — Server / Client / Both —
persisted per-origin in `localStorage`. "Both" stacks two panels so the
server-side and IndexedDB caches can be inspected side by side without
leaving the page.

Docs: new `docs/packages/gxwf-ui.md` (IndexedDB schema, transport matrix,
configuration, CSP gotcha) and `docs/packages/gxwf-web.md` (`/healthz`,
hybrid `tool_specs` envelope, tool-cache REST surface).
