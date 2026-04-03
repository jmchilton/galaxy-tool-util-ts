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

Uses Changesets for versioning. CI publishes automatically via GitHub Actions
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

## Generated Workflow Schemas

Workflow schemas in `packages/schema/src/workflow/raw/` are generated from upstream [schema-salad](https://www.commonwl.org/v1.2/SchemaSalad.html) YAML definitions using [`schema-salad-plus-pydantic`](https://github.com/jmchilton/schema-salad-plus-pydantic). This tool reads the YAML type definitions and emits both TypeScript interfaces and Effect Schema definitions.

The source YAML files live in `schema-sources/` and are synced from the gxformat2 repo:

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
