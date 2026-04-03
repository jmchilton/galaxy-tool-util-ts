# Testing

## Test Runner

All tests use [Vitest](https://vitest.dev/).

```bash
# Run all tests
pnpm -r test

# Run tests for a specific package
cd packages/schema && pnpm test
cd packages/core && pnpm test
```

## Fixture Syncing

Test fixtures are synced from upstream Galaxy and gxformat2 repositories to ensure cross-language compatibility. To sync everything, regenerate schemas, and verify golden checksums in one step:

```bash
GALAXY_ROOT=/path/to/galaxy GXFORMAT2_ROOT=/path/to/gxformat2 make sync
```

This runs all sync targets, regenerates the workflow Effect Schemas via `schema-salad-plus-pydantic`, and verifies golden fixture checksums. It requires checkouts of both [Galaxy](https://github.com/galaxyproject/galaxy) and [gxformat2](https://github.com/galaxyproject/gxformat2).

### Individual Targets

If you only have one of the two checkouts or want to sync a subset, the individual targets are available:

| Target | Env Var | What it syncs |
|---|---|---|
| `sync-golden` | `GALAXY_ROOT` | Golden cache fixtures (cache keys, tool ID parsing, ParsedTool deserialization) |
| `sync-param-spec` | `GALAXY_ROOT` | `parameter_specification.yml` (expected validation behavior per parameter type) |
| `sync-wfstate-fixtures` | `GALAXY_ROOT` | Workflow state test workflows (synthetic, IWC, framework data) |
| `sync-wfstate-expectations` | `GALAXY_ROOT` | Workflow state expectation YAMLs |
| `sync-workflow-fixtures` | `GXFORMAT2_ROOT` | Synthetic workflow files (format2 + native) for normalization tests |
| `sync-workflow-expectations` | `GXFORMAT2_ROOT` | Expectation YAMLs for workflow normalization |
| `sync-schema-sources` | `GXFORMAT2_ROOT` | Schema-salad YAML definitions for workflow schema generation |

### Checking Sync Status

Check if local fixtures have diverged from upstream without overwriting:

```bash
GALAXY_ROOT=/path/to/galaxy GXFORMAT2_ROOT=/path/to/gxformat2 make check-sync
```

Skips checks for whichever env var is unset.

### Verifying Golden Checksums

Verify golden fixture integrity without needing a Galaxy checkout (works in CI):

```bash
make verify-golden
```
