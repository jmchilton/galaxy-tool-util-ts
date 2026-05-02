---
"@galaxy-tool-util/gxwf-ui": minor
---

Browser-side `useToolInfoService` composable — singleton `ToolInfoService`
backed by `IndexedDBCacheStorage`. Sources default to the public Galaxy
ToolShed and (optionally) a co-resident `gxwf-web` / tool-cache-proxy origin
when `VITE_GXWF_TOOL_CACHE_PROXY_URL` is set; the proxy comes first when
present so we get lower-latency, same-origin hits before falling back to
the public shed. `VITE_GXWF_TOOLSHED_URL` and `VITE_GXWF_CACHE_DB_NAME`
override the defaults.

Foundation for `useClientEdgeAnnotations` (next phase) — exposes the same
`getToolInfo` surface as the Node-side service so the connection validator
can drive map/reduce annotations in deployments without `gxwf-web`.

Deployers overriding the default ToolShed must extend the page CSP
`connect-src` to include the override origin (gxwf-web's
`--csp-connect-src` flag); the composable logs an info-level warning to
make this visible during development.
