---
"@galaxy-tool-util/cli": minor
---

Invert CLI metadata: spec-driven commander, no codegen.

`spec/gxwf.json` and `spec/galaxy-tool-cache.json` are now the source of truth for the command surface. `buildGxwfProgram()` and `buildGalaxyToolCacheProgram()` build commander programs at runtime from those specs plus a small handler registry. The `_generated.ts` artifact and `scripts/generate-cli-meta.mjs` are gone; build is a single `tsc` (no double-compile).

`@galaxy-tool-util/cli/meta` keeps its existing `gxwfCliMeta` / `galaxyToolCacheCliMeta` exports (`CliProgramSpec` shape, derived from the specs by a commander-free walker) and additionally re-exports the raw `gxwfSpec` / `galaxyToolCacheSpec`. The subpath stays browser-safe — no commander, no node-only imports.
