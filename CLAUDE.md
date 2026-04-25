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

## Dev Server (gxwf-web + gxwf-ui)

To bring the backend + UI up against a workflows directory (e.g. IWC) for manual debugging:

```bash
# 1. Build once so dist/ matches source (REQUIRED — see note below).
pnpm build

# 2. Backend on :8000, pointed at a workflows dir.
node packages/gxwf-web/dist/bin/gxwf-web.js <workflows-dir> --port 8000

# 3. UI dev server on :5173 in another shell — proxies /workflows and /api to :8000.
#    Default to the Monaco-enabled flow so extension commands (Clean/Convert/Export/
#    Insert Tool Step…) are available; bare `pnpm dev` builds without Monaco.
cd packages/gxwf-ui && \
  VITE_GXWF_MONACO=1 \
  GXWF_EXT_PATH=~/projects/worktrees/galaxy-workflows-vscode/branch/wf_tool_state \
  pnpm dev:with-ext
```

Open http://localhost:5173/. `GXWF_BACKEND_URL` overrides the proxy target (default `http://localhost:8000`).

**Default to Monaco when starting a dev server.** When the user asks for "the dev server" or "dev instance," start the UI via `pnpm dev:with-ext` with `VITE_GXWF_MONACO=1` and `GXWF_EXT_PATH` pointing at the galaxy-workflows-vscode worktree above (`~/projects/worktrees/galaxy-workflows-vscode/branch/wf_tool_state`). Without `VITE_GXWF_MONACO=1` the editor falls back to a plain textarea and the extension never loads. `dev:with-ext` runs the extension's watch script in parallel; refresh the browser tab after extension rebuilds (HMR doesn't reload the extension-host worker). The pinned commit is in `packages/gxwf-ui/EXT_COMMIT.md` — bump it together with the worktree if a fix lands upstream.

**Stale-dist gotcha.** The backend bin runs from `packages/gxwf-web/dist/`, not from source. After editing backend code (router, handlers, schema), `pnpm build` and restart the server before retesting — otherwise the running server is still the old compiled version and you'll chase ghosts (e.g. 404s on routes that exist in source). If you hit an unexpected 4xx/5xx from gxwf-web, first check whether dist is stale via `git status packages/gxwf-web/dist packages/*/dist` or `grep` the relevant code in `dist/` to confirm the change is present.
