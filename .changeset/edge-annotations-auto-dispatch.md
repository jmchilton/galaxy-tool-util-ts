---
"@galaxy-tool-util/cli": minor
"@galaxy-tool-util/gxwf-web": minor
"@galaxy-tool-util/gxwf-ui": minor
---

Auto-dispatch + hybrid endpoint for workflow edge annotations.

`gxwf-ui` `WorkflowDiagram` now drives annotations through the new
`useEdgeAnnotationsAuto` composable: probes `GET /healthz` for the
`edge-annotations` feature on the first build, caches the decision in
`sessionStorage` (`gxwf-ui:annotations-mode`), and falls back to the
client-side composable on probe failure or post-decision server failure
(network / 5xx / CORS). `VITE_GXWF_EDGE_ANNOTATIONS_MODE=server|client`
pins the transport for static deploys that know the answer up front.

`gxwf-web` `POST /workflows/{path}/edge-annotations` now returns
`{ annotations, tool_specs }`; `tool_specs` is keyed by
`${tool_id}@${tool_version}` and carries the `ParsedTool` specs the
validator consumed. Co-resident browsers write these into the IndexedDB
cache via `useToolInfoService.addTool`, so the next workflow load —
whether server-routed or client-side — hits a warm cache and avoids a
second cold-start fanout to ToolShed. Older `gxwf-web` builds that return
the bare `Record<edgeKey, EdgeAnnotation>` are still consumed correctly;
the UI detects the envelope shape and ignores legacy responses.

`@galaxy-tool-util/cli` exports `resolveEdgeAnnotationsAndSpecsWithCache`
+ `ResolvedToolSpec` to support the hybrid response. `gxwf-web`'s
existing `operateEdgeAnnotations` now uses it; the original
`resolveEdgeAnnotationsWithCache` is unchanged.
