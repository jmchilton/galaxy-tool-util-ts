---
name: gen-gxwf-cli-skill
description: Regenerate the single-page gxwf / galaxy-tool-cache CLI skill at docs/skills/gxwf-cli/SKILL.md. Use after CLI churn — runs `make gen-skill` (commander introspection) then enriches the generated scaffold with worked examples and exit-code prose lifted from docs/packages/cli.md.
argument-hint: "[--check]"
user-invocable: true
---

# Generate gxwf-cli skill

Regenerates `docs/skills/gxwf-cli/SKILL.md` — a single-file, distributable skill
covering the surface of both `gxwf` and `galaxy-tool-cache`.

## Why this skill exists

The CLI churns. Hand-maintaining a skill against the binary is how flags rot.
Splitting the work:

- **`make gen-skill`** owns *structure* — what commands exist, what flags they
  accept, defaults, argument names. Deterministic, introspected from the
  commander program definitions in `packages/cli/src/programs/`.
- **This skill** owns *prose* — worked examples, exit-code semantics, narrative
  paragraphs. Pulled from `docs/packages/cli.md`, which is already curated.

This skill never invents API surface; it only moves prose around between two
files you already maintain.

## Steps

1. Run `make gen-skill`. This builds `@galaxy-tool-util/cli` (the generator
   imports from `dist/`) and writes a fresh `docs/skills/gxwf-cli/SKILL.md`.
   Treat its frontmatter, command/option tables, and argument lists as
   authoritative — never hand-edit them. If they look wrong, fix the source
   in `packages/cli/src/programs/` and re-run.

2. For each command heading in the generated file, look up the corresponding
   `### \`<cmd> ...\`` section in `docs/packages/cli.md` and lift:
   - the worked `bash` fenced code block(s) immediately under the heading —
     insert above the option table
   - any narrative paragraph(s) (e.g. "Three phases, each independently
     skippable…", "Source must be a native (.ga) file — format2 inputs are
     rejected.") — insert above the option table
   - exit-code lines ("Exit codes: 0 = …") — insert below the option table
   - any trailing prose paragraph (e.g. "With `--stateful`, scalar types are
     coerced…") — insert below the option table

3. If a command exists in the generated file but has no matching section in
   `cli.md`, leave a `<!-- TODO: examples for <cmd> -->` HTML comment where
   examples would go. Do not invent examples.

4. If a command exists in `cli.md` but not in the generated file, that means
   it was removed from the CLI. Drop it — `cli.md` is the stale one.

5. If invoked with `--check`: after enrichment, diff against the committed
   copy and exit non-zero on drift. (Useful for ad-hoc verification, not CI —
   the generator is allowed to drift between commits.) Otherwise write in
   place.

6. Report:
   - commands added / removed since last generation
   - options added / removed per command
   - any `<!-- TODO -->` markers left behind
   - any `cli.md` sections that were dropped because the command no longer
     exists

## Hard rules

- Never hand-edit the structural tables, frontmatter, or argument lists in
  the output — re-run `make gen-skill` and fix the source.
- Never invent options, flags, or examples not present in
  `packages/cli/src/programs/` or `docs/packages/cli.md`.
- The skill output lives at `docs/skills/gxwf-cli/SKILL.md`. Do not move it.

## Files involved

- `packages/cli/src/programs/gxwf.ts` — `gxwf` program definition
- `packages/cli/src/programs/galaxy-tool-cache.ts` — `galaxy-tool-cache`
  program definition
- `packages/cli/scripts/generate-cli-skill.mjs` — introspection generator
- `docs/packages/cli.md` — prose source (examples, exit codes, narrative)
- `docs/skills/gxwf-cli/SKILL.md` — generated output
