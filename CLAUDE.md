# galaxy-tool-util

TypeScript port of Galaxy's `tool_util` — Effect Schema parameter types, tool cache, CLI, and proxy server.

## Project Structure

pnpm monorepo (`pnpm@10.33.0`) with 4 linked packages:

- **`@galaxy-tool-util/schema`** — Effect Schema definitions for Galaxy parameter types + workflow schemas
- **`@galaxy-tool-util/core`** — ParsedTool model, cache layer (memory + filesystem), ToolShed/Galaxy API client
- **`@galaxy-tool-util/cli`** — `galaxy-tool-cache` and `galaxy-workflow-validate` CLIs (commander)
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

## Fixture Syncing

Test fixtures are synced from upstream Galaxy and gxformat2 repos via Makefile targets. Key env vars:
- `GALAXY_ROOT` — path to Galaxy checkout (for golden cache, param spec, workflow_state fixtures)
- `GXFORMAT2_ROOT` — path to gxformat2 checkout (for workflow fixtures, expectations, schema sources)

Run `make sync` with both set, or individual targets like `make sync-golden`, `make sync-param-spec`, etc.

## Schema Generation

Workflow Effect Schemas in `packages/schema/src/workflow/raw/` are auto-generated from schema-salad YAML via `schema-salad-plus-pydantic`. Regenerate with `make generate-schemas` after `make sync-schema-sources`.

## Releases

Uses changesets with `@changesets/changelog-github`. All 4 packages version together (linked). Repo: `jmchilton/galaxy-tool-util-ts`.

## Docs

Docsify site with TypeDoc API docs. `pnpm docs:dev` to serve locally, `pnpm docs:build` to generate.
