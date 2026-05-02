---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

Port gxformat2's `gxwf-viz` to TS as `gxwf cytoscapejs`.

- `@galaxy-tool-util/schema` exports `cytoscapeElements()` + `elementsToList()` plus
  output-only TS interfaces (`CytoscapeNode`, `CytoscapeEdge`, `CytoscapeElements`, …).
  Snake_case field names + edge-id format are preserved byte-for-byte with the
  Python emitter so the JSON is interchangeable.
- `gxwf cytoscapejs <file> [output]` (`--html` / `--json`) renders a workflow as
  Cytoscape.js JSON or a standalone HTML viewer. Defaults to stdout JSON when no
  output path is given (diverges from Python's "write `.html` next to input").
- The HTML template is synced verbatim from gxformat2 via the new
  `cytoscape-template` group in `scripts/sync-manifest.json` and bundled into
  the CLI dist as a string constant.
- 13 declarative parity cases (synced `cytoscape.yml`) run against the TS
  builder via the existing harness — no sidecar JSON goldens.
