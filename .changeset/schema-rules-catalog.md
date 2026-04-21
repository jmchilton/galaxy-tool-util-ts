---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": patch
---

Add schema-rule catalog port from gxformat2.

Mirrors gxformat2 commit `4b6ecd6`: synced `schema_rules.yml` describes
decode-enforced checks with positive/negative fixtures and lax/strict scope.
New `packages/schema/test/schema-rules-catalog.test.ts` parametrizes validation
over the catalog (22 cases across 7 rules) and enforces integrity: every rule
has positive + negative fixtures, fixture extensions match `applies_to`,
referenced fixtures exist on disk and are covered by `scripts/sync-manifest.json`.

Shared Effect-schema validator dispatch lifted into
`src/workflow/validators.ts` and re-exported from the package entry point:
`validateFormat2{,Strict}`, `validateNative{,Strict}`, `validatorForFixture`,
and `withClass`. The `withClass` helper (class-discriminator injection, recursive
over `.subworkflow` and format2 `.run` inline subworkflows) replaces ad-hoc
copies in `validate-workflow.ts`, `validate-workflow-json-schema.ts`, and
`strict-checks.ts`.

The synced YAML catalog is now copied into `dist/` by a new
`scripts/copy-schema-assets.mjs` build step so runtime consumers (future
`--list-rules`, tooling) can load it from the published package.

New Makefile target `sync-schema-rules` (and `check-sync-schema-rules`) keeps
the catalog in lockstep with the upstream gxformat2 source.
