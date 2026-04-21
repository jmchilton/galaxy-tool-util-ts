---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": patch
---

Port linting-abstraction overhaul from gxformat2 (`adabd80..0aaf7ce`).

**Structured `LintMessage`.** `LintContext.errors` / `warnings` are now
`LintMessage[]` — each carries `message`, `level`, `linter`, and
`json_pointer` alongside the prose. `toString()` returns the message so
template interpolation (`${m}`) and existing string-like callers keep
working. Primitives extracted into `packages/schema/src/workflow/linting.ts`
mirroring Python's `linting.py`.

**`Linter` base + pilot rule.** New `lint-rules.ts` carries metadata-only
`Linter` subclasses. `NativeStepKeyNotInteger` is the first live rule, wired
through `lint.ts` with `linter=` and `json_pointer=` options. `LintContext.child()`
composes RFC 6901 JSON pointers instead of prefixing message text.

**Lint profile catalog.** `lint_profiles.yml` (structural / best-practices /
release) synced from gxformat2 via new `sync-lint-profiles` Makefile target
and `lint-profiles` group in `scripts/sync-manifest.json`. Loader
`parseLintProfiles` + helpers (`lintProfilesById`, `rulesForProfile`,
`iwcRuleIds`, `IWC_PROFILE_NAMES`) re-exported from the package entry.
YAML copied into `dist/` by `copy-schema-assets.mjs` so runtime consumers
can load it from the published package.

**Tests.** New `lint-context.test.ts` (mirrors `test_linting.py`) and
`lint-profiles.test.ts` (mirrors `test_lint_profiles.py`). Declarative
expectation assertions `[errors, 0, linter]` and `[errors, 0, json_pointer]`
flow through the existing path navigator unchanged; `assertValueContains` /
`assertValueAnyContains` coerce `LintMessage` objects via `.message` so
prior string-based expectations remain green.
