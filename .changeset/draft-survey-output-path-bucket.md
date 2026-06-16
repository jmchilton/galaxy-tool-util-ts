---
"@galaxy-tool-util/schema": patch
"@galaxy-tool-util/cli": patch
---

fix(draft-validate): stop counting output-source sentinels as step paths

`buildDraftSurveyReport` deduped every TODO sentinel by step path, so
workflow-output `outputSource` sentinels — all carrying the workflow-root
path `[]` — collapsed into a single empty bucket and were surfaced as one
extra "step path" (off-by-one). Output sentinels now get their own
`DraftSurveyReport.todo_output_paths` bucket, keyed by `[...path, outputLabel]`,
and the `gxwf draft-validate` survey line / report template report them as
"N step path(s) and M output path(s)".
