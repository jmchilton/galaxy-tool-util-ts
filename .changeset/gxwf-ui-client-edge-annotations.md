---
"@galaxy-tool-util/gxwf-ui": minor
---

Browser-side `useClientEdgeAnnotations` composable — peer of
`useEdgeAnnotations` (server route) that runs the connection validator and
edge-annotation builder locally against the IndexedDB-backed
`useToolInfoService`. Lights up map/reduce annotations in deployments
without `gxwf-web` (static / embed / offline previews).

Surfaces `{ annotations, loading, error, misses, progress, build, clear }`
— `annotations`/`loading`/`error`/`build`/`clear` are shape-compatible with
`useEdgeAnnotations`, so renderers can swap with a one-line import change.
The additive `misses` and `progress` refs feed cold-start UX: progress
ticks once per tool ref while preloading at concurrency 6, and tools that
fail to resolve land in `misses` with `{toolId, toolVersion, reason}`
instead of throwing — annotations on edges into unresolved tools simply
don't appear.

Note: `misses` is collected but not yet surfaced in the diagram toolbar;
the cold-start progress pill + miss dialog + retry-via-`refetch` UI are a
follow-up. Until then, partial annotations render silently.
