---
"@galaxy-tool-util/core": patch
"@galaxy-tool-util/cli": patch
---

fix(populate-workflow): don't abort the batch on the first unresolvable tool

`ToolInfoService.getToolInfo` threw `No version available for tool: …` when a
tool's version couldn't be resolved (short/unversioned ids, local tools, TRS
errors), violating its `Promise<ParsedTool | null>` contract. The uncaught
throw escaped `populate-workflow`'s per-tool loop, aborting the whole run and
caching nothing — even tools already processed.

`getToolInfo` now returns `null` on an unresolvable version, matching the
existing all-sources-failed path and its declared contract (this also fixes
`add` and the proxy `getTool`/`toolSchema` routes, which already handled
`null`). `populate-workflow` additionally wraps each lookup in try/catch so any
unexpected error downgrades to a per-tool failure and the batch still reports
`N/M cached, K failed`.
