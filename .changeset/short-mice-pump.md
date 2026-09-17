---
"@galaxy-tool-util/core": patch
---

fix(core): stop dumping the full `ParsedTool` type on a tool-metadata decode failure

`fetchFromToolShed`/`fetchFromGalaxy` decoded the fetched JSON with
`Schema.decodeUnknownSync`, whose default `ParseError#message` renders the
entire expected type declaration alongside the failure — tens of thousands of
characters for `ParsedTool`'s output union. A single tool-cache miss during
`gxwf draft-validate --concrete` (surfaced via `ToolInfoService`'s
`onDiagnostic`) could print one `~19,000`-character diagnostic naming nothing
more useful than `["structure"] is missing`.

Both fetchers now decode through `ParseResult.ArrayFormatter` instead, so a
decode failure raises a `ToolFetchError` naming the failing field path(s) and
reason only, e.g. `invalid tool metadata from <url>: [structure] is missing`.
