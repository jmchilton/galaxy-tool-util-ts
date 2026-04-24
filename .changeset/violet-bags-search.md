---
"@galaxy-tool-util/cli": minor
"@galaxy-tool-util/search": minor
---

Add Tool Shed discovery commands to `gxwf`:

- `gxwf tool-search <query>` — search the Tool Shed (`toolshed.g2.bx.psu.edu`).
  Prints a tabular listing by default; `--json` emits a `{ query, hits }`
  envelope. Exit codes: `0` on hits, `2` on empty, `3` on fetch error.
- `gxwf tool-versions <tool-id>` — list TRS-published versions (newest last),
  accepting both `owner~repo~tool_id` and `owner/repo/tool_id` forms.
  `--latest` prints only the latest version. Same exit-code convention.

Exports `normalizeHit` from `@galaxy-tool-util/search` so single-source
callers can paginate with `iterateToolSearchPages` and normalize hits
without instantiating `ToolSearchService`.
