# galaxy-tool-util

TypeScript port of Galaxy's `tool_util` — Effect Schema parameter types, tool cache, CLI, and proxy server.

## Project Structure

pnpm monorepo (`pnpm@10.33.0`) with 4 linked packages:

- **`@galaxy-tool-util/schema`** — Effect Schema definitions for Galaxy parameter types + workflow schemas
- **`@galaxy-tool-util/core`** — ParsedTool model, cache layer (memory + filesystem), ToolShed/Galaxy API client
- **`@galaxy-tool-util/cli`** — `galaxy-tool-cache` and `gxwf` CLIs (commander)
- **`@galaxy-tool-util/tool-cache-proxy`** — `galaxy-tool-proxy` HTTP server mirroring ToolShed API (Effect HttpServer, YAML config, CORS)

Dependency chain: `schema` ← `core` ← `cli` / `tool-cache-proxy`. Internal deps use `workspace:*`.

## Commands

```bash
make check          # lint + format + typecheck (use before committing)
make test           # vitest run across all packages
make fix            # auto-fix lint + format
pnpm build          # tsc build all packages
pnpm changeset      # create changeset entry for releases
```

## Code Conventions

- **ES modules** throughout (`"type": "module"`, ES2022 target, Node16 resolution)
- **Effect library** is central: `import * as S from "effect/Schema"`, `Either` for validation results
- **Consistent type imports** enforced: `import type { Foo } from "..."`
- **No floating promises** enforced in src (must await or void)
- **Unused vars** must be `_`-prefixed
- **`no-explicit-any`** is allowed (rule is off)
- **Prettier**: double quotes, semicolons, trailing commas, 100 char width, 2-space indent
- Tests import `describe`, `it`, `expect` explicitly from `vitest` (no globals)
- Tests live in `packages/{pkg}/test/**/*.test.ts`

## Fixture Syncing & Schema Generation

`make sync` syncs all fixtures, regenerates workflow Effect Schemas, and verifies golden checksums. Requires both env vars:
- `GALAXY_ROOT` — path to Galaxy checkout
- `GXFORMAT2_ROOT` — path to gxformat2 checkout

Individual targets (e.g. `make sync-golden`, `make sync-param-spec`) are available when you only have one checkout.

## Releases

Uses changesets with `@changesets/changelog-github`. All published packages version together (linked). Repo: `jmchilton/galaxy-tool-util-ts`. See `docs/development/publication.md` for full details on how publication works and how to onboard new packages.

**Changesets are required** for commits that affect published packages (`packages/*/src/`). When committing user-visible changes (features, fixes, API changes), include a changeset:

```bash
pnpm changeset        # select packages, pick bump level, describe the change
git add .changeset/   # commit the .changeset/*.md alongside your code
```

- Use `pnpm changeset --empty` for commits that don't warrant a version bump (docs, CI, tests, internal refactors).
- CI enforces changeset presence on PRs via `changeset status`.
- Pre-commit hooks run prettier and eslint on staged files (`pre-commit install` to set up).

## Docs

Docsify site with TypeDoc API docs. `pnpm docs:dev` to serve locally, `pnpm docs:build` to generate.
