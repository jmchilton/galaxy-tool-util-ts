---
"@galaxy-tool-util/cli": patch
"@galaxy-tool-util/schema": patch
---

fix(cli): surface malformed workflows in tree walks instead of dropping them

`discoverWorkflows` parsed each candidate file inside a `try/catch` that
returned `null` on failure, and a `null` parse was indistinguishable from
"this file is not a workflow" — so a `.ga` or `.gxwf.yml` with a syntax error
was silently omitted from the tree. `gxwf validate-tree` / `lint-tree` then
reported a workflow count that quietly excluded the broken files, which is the
worst possible outcome for a batch linter.

Files with an unambiguous workflow extension (`.ga`, `.gxwf.yml`, `.gxwf.yaml`)
that fail to parse are now carried through as a `loadError` outcome and
reported as `ERROR`, with the count added to the summary line. Malformed plain
`.yml`/`.json` files stay silently skipped — those extensions are ambiguous and
could be any unrelated file.

Also: `validate-tree --no-tool-state` (and the no-cache path) now enumerates
tool steps and marks each with the new `skip_no_tool_state` status rather than
reporting zero steps. That enumeration stays offline — no resolver is passed,
so subworkflow expansion is inline-only and an unreachable external reference
can no longer fail an otherwise-clean `--no-tool-state` run — and
`--strict-state` treats `skip_no_tool_state` as exempt, matching how the
single-file `gxwf validate` handles the same flag combination.

Tree outcome errors are collapsed to their first line where they are recorded,
so every consumer benefits: the per-workflow console listing in all five tree
commands, and the `|`-delimited Markdown report tables that a raw multi-line
YAML parse error would otherwise wreck.
