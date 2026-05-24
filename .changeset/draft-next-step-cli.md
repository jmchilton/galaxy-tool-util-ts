---
"@galaxy-tool-util/cli": minor
---

Add `gxwf draft-next-step <file>` — wraps `nextDraftStep` from `@galaxy-tool-util/schema` and emits the locked-shape `NextStepResult` as pretty-printed JSON (default, the agent-loop wire format) or `--output-format markdown` for a human-glance checklist. Pure pass-through: same input → byte-identical output. Exit 0 whenever the file parses as a workflow document (draft or not); exit 2 only on read/parse failure or when `--format native` is forced.
