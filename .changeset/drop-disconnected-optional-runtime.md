---
"@galaxy-tool-util/schema": patch
"@galaxy-tool-util/cli": patch
---

Stateful conversion: drop disconnected-optional `RuntimeValue` markers and stop double-stamping connected params.

`convertStateToFormat2` now evaluates each leaf connection-first with an early return, then gates `RuntimeValue` handling on optionality (mirrors Galaxy's Phase 1 converter change):

- A `RuntimeValue` on an **optional, disconnected** leaf is omitted entirely — no state key and, crucially, no phantom `in:` connection claiming `source: "runtime_value"`. This is native authored content (a real optional input the user left unset), not a missed connection, so format2 should carry no trace of it. Verified against the IWC `average-bigwig-between-replicates` workflow, whose `advancedOpt|blackListFileName` now drops cleanly.
- A `RuntimeValue` on a **required, disconnected** leaf still records the placeholder (correct `workflow_step_linked` behavior).
- A leaf that is **connected** — via `input_connections` or a `ConnectedValue` marker — is always treated as a pure connection, even when the native state also carries a stray `RuntimeValue` marker (legacy workflows do this). The previous empty-`if`/fall-through double-stamped these with a runtime placeholder.

Roundtrip diffing already classifies a dropped optional `RuntimeValue` as benign (`connection_only_section_omitted`), so no roundtrip change was needed.
