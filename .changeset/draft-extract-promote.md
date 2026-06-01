---
"@galaxy-tool-util/cli": minor
"@galaxy-tool-util/schema": minor
---

Promote `draft-extract` to a first-class command + add `--concrete` to `draft-validate`:

- **cli**: rename `_draft-extract` → `draft-extract` (no longer hidden from `gxwf --help` or the generated skill doc). Same behavior, same flags.
- **cli**: `gxwf draft-validate --concrete <file>` runs the extract pipeline (`extractConcreteSubset` → `stripPlanFields` → `promoteFullyConcreteDrafts`) and then runs the regular `gxwf validate` checks on the trimmed workflow. Forwards the relevant validate flags:
  - `--cache-dir <dir>` + `--no-tool-state` — tool-state validation (default on; matches `gxwf validate`)
  - `--connections` — connection-type compatibility
  - `--strict` / `--strict-structure` / `--strict-encoding` / `--strict-state`
  Any concrete-pass failure escalates the exit code to 1. When the extracted subset is still a draft (not fully promoted), every concrete-stage check is skipped, not failed.
- **schema**: `SingleDraftValidationReport` gains an optional `concrete` field (`ConcreteValidationReport`) populated when `--concrete` was requested. Carries `class_after`, `skipped_reason`, `structure_errors`, plus optional `strict_structure_errors`, `strict_encoding_errors`, `strict_state_errors`, `tool_state`, `connection_report` depending on which flags were forwarded. `ok` is tri-state: `true` when every check ran clean, `false` when any failed, `null` when the concrete pass was skipped (e.g., subset still draft). Skipped concrete does NOT drag the aggregate `report.ok` down — consumers must treat `null` as "unknown," not as a pass. `buildSingleDraftValidationReport` takes an optional third arg.
