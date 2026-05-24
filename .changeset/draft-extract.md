---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

Add the draft-extract pipeline:

- **schema**: new helpers `stripPlanFields` (remove `_plan_*` planning fields from steps + workflow root, recursive into draft subworkflows) and `promoteFullyConcreteDrafts` (flip `class: GalaxyWorkflowDraft` → `class: GalaxyWorkflow` on any (sub)workflow that is now fully concrete). Plus `SingleDraftExtractReport` + `buildSingleDraftExtractReport` sidecar report model. `extractConcreteSubset` and its drop/rewrite types are now re-exported from the package root.
- **cli**: new hidden command `gxwf _draft-extract <file>` — pipes a draft workflow through `extractConcreteSubset` → `stripPlanFields` → `promoteFullyConcreteDrafts` and emits the trimmed workflow (YAML to stdout or `-o file`; `.ga`/`.json` extensions trigger native JSON serialization). Optional `--report-json [file]` sidecar. Rejects the stdout-collision case where the workflow + `--report-json` would both write to stdout. Hidden from `gxwf --help` and from the generated skill doc.
- **cli/meta**: `SpecCommand.hidden?: boolean` — declarative way to mark a command as hidden from help. `buildProgramFromSpec` honors it; the skill generator (`make gen-skill`) skips hidden commands too.
- **cli/internal**: new `findStdoutSinkCollision` helper in `report-output.ts` — generalizes the C-fixup `findStdoutSinkConflict` to accept arbitrary `{flag, toStdout}` pairs, so commands whose stdout sinks aren't drawn from `--json` / `--report-{html,markdown}` can reuse the same check.
