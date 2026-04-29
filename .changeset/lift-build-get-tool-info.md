---
"@galaxy-tool-util/connection-validation": minor
"@galaxy-tool-util/cli": patch
---

Lift `collectToolRefs` and `buildGetToolInfo` from `@galaxy-tool-util/cli` into
`@galaxy-tool-util/connection-validation` so browsers (and any future
non-Node consumer) can drive the same preload-then-validate pipeline the CLI
uses.

- `connection-validation`: new exports `collectToolRefs`, `buildGetToolInfo`,
  and types `ToolRef`, `AsyncToolFetcher`, `BuildGetToolInfoOptions`. The
  lifted helper takes an `AsyncToolFetcher` callback (browser caches and CLI
  ToolCaches both fit) and supports optional `concurrency` (default 1, matching
  the CLI's prior behavior), `onMiss`, and `onProgress` callbacks. The
  version-negotiation contract (`lookupKey` + first-by-tool-id fallback) moves
  with the helper so CLI and future browser callers can't drift.
- `cli`: `commands/connection-validation.ts` collapses to a thin adapter that
  wires the on-disk `ToolCache` into the lifted helper via `loadCachedTool`.
  External API (`buildConnectionReport`, `buildGetToolInfo`, `collectToolRefs`,
  `ToolRef`) is unchanged.
