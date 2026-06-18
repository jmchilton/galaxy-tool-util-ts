---
"@galaxy-tool-util/cli": patch
---

fix(cli): correct `galaxy-tool-cache` command/option help to match documented behavior

The CLI spec (`spec/galaxy-tool-cache.json`) — the single source the commander program,
`--help`, and the browser-safe `meta` API are all built from — still described
`--galaxy-url` as a "fallback" and `add` as fetching from "ToolShed/Galaxy", contradicting
the guide docs updated in #136. Stock/built-in bare IDs resolve against the ToolShed, so:

- `add` description and `<tool_id>` arg now state bare/stock IDs are supported.
- `--galaxy-url` reworded to "Alternate Galaxy source, tried after the ToolShed" (matches
  `docs/guide/configuration.md` and `docs/packages/cli.md`).
- `list` description notes it surfaces resolved versions (the stock-version discovery surface).

Help text and docs no longer disagree; no behavior change.
