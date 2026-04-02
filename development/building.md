# Building

## Build Order

Packages must be built in dependency order:

```
schema → core → cli, server
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

Uses Changesets for versioning:

```bash
# 1. Add a changeset describing your change
pnpm changeset

# 2. Version packages (updates package.json + CHANGELOG)
pnpm version-packages

# 3. Build and publish
pnpm release
```

## Generated Workflow Schemas

Workflow schemas in `packages/schema/src/workflow/raw/` are generated from schema-salad YAML sources using `schema-salad-plus-pydantic`:

```bash
# Requires schema-salad-plus-pydantic >= 0.1.5
make generate-schemas
```

This produces both TypeScript types and Effect Schema definitions for format2 and native workflow formats.
