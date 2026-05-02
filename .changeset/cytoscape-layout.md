---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

Add `--layout <name>` to `gxwf cytoscapejs` (and the underlying
`cytoscapeElements({ layout })` builder option).

`preset` (default) keeps today's coordinate-from-NF2 emission byte-for-byte,
including the Python `(10*i, 10*i)` fallback. `topological` overwrites every
node's `position` using a small longest-path layering algorithm — pinned in
`docs/architecture/cytoscape-layout.md` so the gxformat2 port can land
byte-equal coordinates. Hint-only layouts (`dagre`, `breadthfirst`, `grid`,
`cose`, `random`) drop `data.position` and emit a top-level
`layout: { name: "<n>" }` hint that the bundled HTML viewer (now ships
`cytoscape-dagre`) and `gxwf-ui` honor at view time.

JSON output gains a `{ elements, layout }` wrapper when `--layout` is
non-default. The default `preset` flow continues to write a bare list for
Python parity.
