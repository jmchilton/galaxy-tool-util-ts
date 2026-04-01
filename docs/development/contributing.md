# Contributing

## Setup

```bash
git clone https://github.com/jmchilton/galaxy-tool-util.git
cd galaxy-tool-util
pnpm install
pnpm build
```

## Development Workflow

```bash
# Run all checks (lint + format + typecheck)
make check

# Run all tests
make test

# Auto-fix lint and format issues
make fix
```

## Package Scripts

Each package has identical scripts:

```bash
pnpm -r build       # Build all packages
pnpm -r typecheck   # Type-check all packages
pnpm -r test        # Run all tests
pnpm -r lint        # Lint all packages
pnpm -r format      # Check formatting
pnpm -r format-fix  # Fix formatting
```

## Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for versioning and changelogs.

When making a change that should be published:

```bash
pnpm changeset
# Follow prompts to select packages and describe the change
```

Changesets are committed alongside your code. On merge to main, the CI will create a version PR that bumps versions and updates changelogs.

## Pull Requests

- One logical change per PR
- Include changeset if the change affects published packages
- All checks must pass (`make check && make test`)
