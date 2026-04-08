# Building

## Build Order

Packages must be built in dependency order:

```
schema → core → cli, tool-cache-proxy
```

`pnpm -r build` handles this automatically via the workspace dependency graph.

## TypeScript Configuration

All packages share the same TS config:
- **Target**: ES2022
- **Module**: Node16
- **Declarations**: Enabled with declaration maps
- **Source maps**: Enabled

Output goes to `dist/` in each package.

## Build Commands

```bash
# Build all packages
pnpm build

# Build a single package
cd packages/schema && pnpm build

# Type-check without emitting
pnpm typecheck
```

## Publishing

Uses [Changesets](https://github.com/changesets/changesets) for versioning. CI publishes automatically via [GitHub Actions](https://github.com/features/actions)
when changesets are merged to `main`.

```bash
# 1. Add a changeset describing your change
pnpm changeset

# 2. Version packages (updates package.json + CHANGELOG)
pnpm version-packages

# 3. Build and publish
pnpm release
```

### Adding a New Package to npm

When adding a new `@galaxy-tool-util/*` sub-package, follow these steps to
register it with npm and configure trusted publishing.

#### 1. Configure `package.json`

Ensure the new package has the standard `publishConfig`:

```json
{
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

#### 2. Initial Publish (Local)

The first publish must be done locally since the package doesn't exist on npm
yet and trusted publishing can't be configured until it does.

```bash
# Login if needed
npm login

# Build, then publish with provenance disabled (only works in CI)
pnpm build
cd packages/<new-package>
npm publish --access public --provenance false
```

#### 3. Configure Trusted Publishing on npmjs.com

Once the package exists on npm:

1. Go to the package page on npmjs.com → **Settings** → **Trusted Publishers**
2. **Add GitHub Actions** with:
   - **Repository:** `jmchilton/galaxy-tool-util-ts`
   - **Workflow:** `release.yml`
   - **Environment:** `npm-publish`

This enables token-free OIDC publishing from CI — no npm tokens or secrets needed.

#### 4. Verify GitHub Environment

The repo should already have an `npm-publish` environment configured under
**Settings → Environments**. No additional GitHub-side setup is needed per
package — the trusted publisher config on npmjs.com is per-package, but the
GitHub environment is shared.

## Running Locally

After `pnpm build`, you can run every binary directly via `node` — no global install needed.

### CLI tools

```bash
# gxwf — workflow validate / lint / clean / convert
node packages/cli/dist/bin/gxwf.js --help
node packages/cli/dist/bin/gxwf.js validate ./my-workflow.ga

# galaxy-tool-cache — inspect and populate the tool cache
node packages/cli/dist/bin/galaxy-tool-cache.js --help
```

### Proxy server

```bash
node packages/tool-cache-proxy/dist/bin/galaxy-tool-proxy.js --config proxy.yaml
```

### gxwf-web server

The server bundles the gxwf-ui frontend and serves it at the root alongside the API. After a full build it runs as a single process:

```bash
# Build gxwf-ui first, then gxwf-web (copy-ui.mjs runs automatically)
pnpm --filter @galaxy-tool-util/gxwf-ui build
pnpm --filter @galaxy-tool-util/gxwf-web build

# Start — UI at http://localhost:8000/, API at /workflows and /api
node packages/gxwf-web/dist/bin/gxwf-web.js ./workflows

# Custom port, with an existing cache dir
node packages/gxwf-web/dist/bin/gxwf-web.js ./workflows --port 9000 --cache-dir ~/.cache/galaxy-tools
```

If `pnpm -r build` is run from the monorepo root it will build in the right order automatically (gxwf-ui is declared as a devDependency of gxwf-web).

#### UI development mode

For fast frontend iteration, run the Vite dev server in `gxwf-ui` alongside `gxwf-web`. Vite's proxy forwards `/workflows` and `/api` to the backend:

```bash
# Terminal 1 — API server (no UI bundling needed)
node packages/gxwf-web/dist/bin/gxwf-web.js ./workflows

# Terminal 2 — Vite dev server with HMR at http://localhost:5173/
cd packages/gxwf-ui && pnpm dev
```

For active backend development, add `tsc --watch` in a third terminal so server changes are picked up on restart:

```bash
cd packages/gxwf-web && npx tsc --watch
```

### Smoke-testing the server

Once running, hit the API directly:

```bash
# List discovered workflows
curl http://localhost:8000/workflows | jq

# Validate a specific workflow
curl "http://localhost:8000/workflows/my-workflow.ga/validate" | jq

# Export the structural JSON Schema
curl "http://localhost:8000/api/schemas/structural?format=native" | jq
```

### Using local packages in an external project

To point an external project at your local checkout instead of the npm registry, use a `file:` reference in its `package.json`:

```json
{
  "dependencies": {
    "@galaxy-tool-util/core": "file:/path/to/galaxy-tool-util/packages/core",
    "@galaxy-tool-util/schema": "file:/path/to/galaxy-tool-util/packages/schema"
  }
}
```

Then run `pnpm install` in the external project to wire up the symlinks. Remember to rebuild (`pnpm build`) in this repo whenever you change source files — the `file:` reference points at `dist/`, not the TypeScript sources.

Alternatively, use `pnpm link` for a global symlink approach:

```bash
# Register the package globally from this repo
cd packages/core && pnpm link --global

# In your external project
pnpm link --global @galaxy-tool-util/core
```

## Generated Workflow Schemas

Workflow schemas in `packages/schema/src/workflow/raw/` are generated from upstream [schema-salad](https://www.commonwl.org/v1.2/SchemaSalad.html) YAML definitions using [`schema-salad-plus-pydantic`](https://github.com/jmchilton/schema-salad-plus-pydantic). This tool reads the YAML type definitions and emits both TypeScript interfaces and [Effect Schema](https://effect.website/docs/schema/introduction) definitions.

The source YAML files live in `schema-sources/` and are synced from the [gxformat2](https://github.com/galaxyproject/gxformat2) repo:

```bash
# Sync upstream schema-salad YAML sources
GXFORMAT2_ROOT=/path/to/gxformat2 make sync-schema-sources

# Regenerate TypeScript + Effect Schema definitions
# Requires schema-salad-plus-pydantic >= 0.1.5
make generate-schemas
```

This produces four generated files covering format2 and native workflow formats:

- `gxformat2.ts` / `gxformat2.effect.ts` — format2 workflow types and schemas
- `native.ts` / `native.effect.ts` — native Galaxy workflow types and schemas

These files should not be edited by hand — re-run the generation after syncing updated sources.
