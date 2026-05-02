# @galaxy-tool-util/gxwf-web

HTTP server that exposes Galaxy workflow operations, a Jupyter-compatible contents API, and a tool-cache inspection surface. Ships with the prebuilt `gxwf-ui` frontend.

For installation, CLI flags, YAML config, and the full route catalogue see the [gxwf-web Server guide](guide/gxwf-web.md). This page covers the surface that's specific to the package's role inside the workspace — feature discovery, edge-annotations, and the hybrid response that primes the browser cache.

## Feature discovery (`/healthz`)

```
GET /healthz
```

```json
{
  "status": "ok",
  "features": ["edge-annotations"]
}
```

`gxwf-ui`'s `useEdgeAnnotationsAuto` probes this on first build (1.5s timeout). When `features` lists `"edge-annotations"`, the UI binds to the server transport and caches the decision in `sessionStorage`. Anything else — non-200, network error, missing feature — falls through to the browser-side transport.

## Edge annotations + hybrid response

```
POST /workflows/{path}/edge-annotations
```

Resolves every tool a workflow references (subworkflows + nested `run` walked too), runs `validateConnectionGraph`, and returns the resulting `EdgeAnnotation` map keyed by edge id. The same orchestrator powers both transports — see [`@galaxy-tool-util/gxwf-ui`](packages/gxwf-ui.md) for the browser-side peer.

Response shape:

```json
{
  "annotations": {
    "1->2:input": { "kind": "map", "...": "..." }
  },
  "tool_specs": {
    "<tool-id>@<version>": {
      "tool_id": "...",
      "tool_version": "...",
      "parsed": { "...": "..." }
    }
  }
}
```

`annotations` is the legacy / required payload. `tool_specs` is **additive** — older `gxwf-web` builds omit it and the UI silently ignores absence. When present, `gxwf-ui` writes each spec into its IndexedDB tool cache as a side effect. The next user action that touches the same tools — even one routed through the client-side transport because the backend went away — runs against a warm browser cache.

This is the convergence between the server-side and client-side annotation transports: **the server primes the client cache for free**. Both transports remain first-class and supported; deployments choose based on their constraints (centralized cache control, CSP, offline / embed mode).

The `tool_specs` envelope is unconditionally returned today. A planned `?include_specs=true` query flag will let server-only callers (no browser cache to prime) opt out once payload size on large workflows (60+ tools, ~1–3 MB JSON) is measured against shared deployments.

## Tool cache REST surface

The `/api/tool-cache` routes back the **server-side** half of the [`/cache` view](packages/gxwf-ui.md#tool-cache-view):

| Route | Purpose |
|---|---|
| `GET /api/tool-cache` | List entries + aggregate stats. `?decode=1` probes each payload for ParsedTool decode-ability |
| `GET /api/tool-cache/{cacheKey}` | Raw payload + decode flag |
| `DELETE /api/tool-cache/{cacheKey}` | Remove one entry |
| `DELETE /api/tool-cache?prefix=…` | Bulk-remove by `tool_id` prefix |
| `POST /api/tool-cache/refetch` | Force refetch of `{toolId, toolVersion?}` |
| `POST /api/tool-cache/add` | Idempotent populate of `{toolId, toolVersion?}` |

Schemas are generated from the OpenAPI spec under `@galaxy-tool-util/gxwf-client` and consumed by `useToolCache`.

## See also

- [gxwf-web Server guide](guide/gxwf-web.md) — installation, CLI flags, YAML config, full route catalogue
- [`@galaxy-tool-util/gxwf-ui`](packages/gxwf-ui.md) — UI consumer of `/healthz`, edge-annotations, tool-cache routes
- [`@galaxy-tool-util/core`](packages/core.md) — `ToolCache`, `ToolInfoService`, source resolution
