---
"@galaxy-tool-util/gxwf-web": minor
"@galaxy-tool-util/cli": minor
---

`gxwf-web` adds two new endpoints:

- `POST /workflows/{path}/edge-annotations` — server-side edge annotation
  resolution (map-over depth + reductions) backed by the workspace tool
  cache. Powers the gxwf-ui map/reduce overlay without the browser doing
  ToolShed fetches.
- `GET /healthz` — liveness probe returning `{ status, features }`. The
  `features` array advertises capabilities (`edge-annotations`) for clients
  that want to detect the server before falling back to a client-side path.

To support the route, `@galaxy-tool-util/cli` exposes
`resolveEdgeAnnotationsWithCache(data, cache)` so the gxwf-web handler can
share the CLI's annotate-connections pipeline against an externally-owned
`ToolCache`.
