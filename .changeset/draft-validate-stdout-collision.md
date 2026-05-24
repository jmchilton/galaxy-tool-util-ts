---
"@galaxy-tool-util/cli": patch
---

`gxwf draft-validate`: refuse to write more than one report sink (`--json`, `--report-html`, `--report-markdown`) to stdout in a single run — exit 2 with a clear error instead of silently interleaving JSON + HTML/Markdown. File destinations are still fine alongside `--json`. Adds `findStdoutSinkConflict` helper in `report-output.ts` (also usable by future commands). Template polish: render `report.survey.is_draft` as `yes`/`no` instead of literal `true`/`false`, and double-tick path spans so a backtick inside a step label can no longer break the inline code rendering.
