# @galaxy-tool-util/gxwf-ui

Vue 3 / PrimeVue single-page app for browsing workflow files, rendering connection graphs, and running workflow operations against a `gxwf-web` backend. Internal-only package — not published to npm.

## Edge-annotations transports

Map / reduce edge annotations are produced by `@galaxy-tool-util/connection-validation`, which needs `ParsedTool` specs for every tool a workflow references. `gxwf-ui` ships **two interchangeable transports** that pull those specs and run the validator:

| Composable | Where the work runs | When to use |
|---|---|---|
| `useEdgeAnnotations` | Server (`gxwf-web` `POST /workflows/{path}/edge-annotations`) | Centralized cache, no per-client ToolShed fanout, CSP-locked deploys |
| `useClientEdgeAnnotations` | Browser (`useToolInfoService` → IndexedDB → ToolShed/proxy) | Static / embed / offline deploys with no `gxwf-web` |
| `useEdgeAnnotationsAuto` | Probes `/healthz` on first build, picks one and sticks (cached in `sessionStorage`) | Default for `WorkflowDiagram` — works in both deployment shapes |

All three share the same reactive surface (`{ annotations, loading, error, build, clear }`) so callers can swap with a one-line import change. `useClientEdgeAnnotations` and `useEdgeAnnotationsAuto` additionally expose `misses` and `progress` for cold-start UX.

### Build-time pinning

Pin a transport for static deploys that know the answer up front:

```bash
VITE_GXWF_EDGE_ANNOTATIONS_MODE=client pnpm build
```

Accepts `"server"` or `"client"`. Without the pin, `useEdgeAnnotationsAuto` probes the backend at runtime.

### Hybrid response — cache prewarming

When the **server** transport is used, `gxwf-web` returns both `annotations` and a `tool_specs` envelope of the `ParsedTool` payloads it consulted. `useEdgeAnnotations` writes those specs into the same IndexedDB cache that `useClientEdgeAnnotations` reads. Subsequent calls — including ones that lose the backend (reload, embed, offline) — hit a warm browser cache without re-fetching. The two transports compose rather than compete.

The `tool_specs` envelope is unconditionally returned today. A follow-up will gate it behind `?include_specs=true` once payload size on large workflows (60+ tools, ~1–3 MB JSON) is measured against shared deployments.

## Browser tool cache (IndexedDB)

`useToolInfoService` constructs a singleton `ToolInfoService` backed by `IndexedDBCacheStorage`. Cache writes happen on every successful fetch; reads are sync-feel (in-memory `Map` in front of IndexedDB). Entries persist across reloads and tab restarts — only an explicit `clearCache()` (or the `/cache` view's "Clear all" / "Clear by prefix") removes them.

### IndexedDB schema

| | |
|---|---|
| Database name | `gxwf-ui:tool-cache` — set by `useToolInfoService`; override via `VITE_GXWF_CACHE_DB_NAME`. The underlying `IndexedDBCacheStorage` class default is `galaxy-tool-cache-v1` |
| Version | `1` |
| Object store | `data` |
| Key | `cacheKey = sha256("<toolshedUrl>/<trsToolId>/<version>")` — **content-addressed**; tools are immutable per version on ToolShed |
| Value | `ParsedTool` JSON, or a `CacheIndex` metadata blob under the reserved key `__index__` |
| TTL | None — see below |

The `__index__` entry tracks `cached_at`, `source`, `source_url`, etc. for each entry — that's what powers the `/cache` view's table without re-reading every payload.

### Why no TTL?

Cache keys hash the version, so any *new* version of a tool gets a different key — the cache is never serving stale data for a pinned version. The only stale-resolution surface is `null`-version refs, where `ToolInfoService.resolveLatestVersion` always re-fetches the TRS version list. Net: no TTL is correct, and adding one would just waste fetches. If a deployer edits a tool locally and wants to re-pull, the `/cache` view's "Clear all" or "Clear by prefix" actions are the explicit knob.

### Configuration

| Env var | Default | Meaning |
|---|---|---|
| `VITE_GXWF_TOOLSHED_URL` | `https://toolshed.g2.bx.psu.edu` | Where browser-side tool fetches go |
| `VITE_GXWF_TOOL_CACHE_PROXY_URL` | unset | Optional proxy URL (e.g. a `gxwf-web` `/tools` route). When set, the proxy is tried *before* ToolShed |
| `VITE_GXWF_CACHE_DB_NAME` | `gxwf-ui:tool-cache` | IndexedDB name — useful for test isolation or multi-instance hosts |
| `VITE_GXWF_EDGE_ANNOTATIONS_MODE` | unset | Pin transport to `"server"` or `"client"` (build-time) |

### CSP gotcha

The default Content-Security-Policy `connect-src` only allows the default ToolShed. Overriding `VITE_GXWF_TOOLSHED_URL` **without** also extending CSP silently breaks every browser-side fetch.

For `gxwf-web` hosts, pass `--csp-connect-src https://your-toolshed.example.com`. For static / CDN hosts, the deployer owns the CSP header and must add the override origin themselves. `useToolInfoService` logs a `console.info` reminder whenever a non-default ToolShed is configured.

### Quota / private browsing

`IndexedDBCacheStorage` writes can fail in private-browsing mode or under quota pressure. Failures surface as fetch rejections in `ToolInfoService` and land in `useClientEdgeAnnotations.misses` rather than killing the build — annotations for the affected edges silently degrade to no-annotation, same fidelity loss as if the validator had no specs.

## Tool Cache view

`/cache` renders the same `ToolCacheTable` / `ToolCacheStats` / `ToolCacheRawDialog` components against either backend, picked by a transport selector at the top:

- **Server** — pulls from the `gxwf-web` `/api/tool-cache` REST surface via `useToolCache`.
- **Client** — pulls from the browser IndexedDB cache via `useClientToolCache`.
- **Both** — renders both panels stacked.

`useClientToolCache` mirrors `useToolCache`'s reactive surface (`{ entries, stats, loading, error, refresh, loadRaw, del, clear, refetch, add }`) so the existing components render unchanged. The selection is persisted per-origin in `localStorage` under `gxwf-ui:cache-transport`.

## See also

- [`@galaxy-tool-util/core`](packages/core.md) — `ToolInfoService`, `IndexedDBCacheStorage`, `ToolCache`
- [`@galaxy-tool-util/connection-validation`](packages/workflow-graph.md) — edge-annotation pipeline + `buildGetToolInfo`
- [`gxwf-web` server guide](guide/gxwf-web.md) — server-side cache, `/healthz`, hybrid response
