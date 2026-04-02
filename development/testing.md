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

Test fixtures are synced from upstream Galaxy and gxformat2 repositories to ensure cross-language compatibility.

### Golden Cache Fixtures

Golden fixtures verify the TS cache layer produces identical results to Python for cache key computation, tool ID parsing, and ParsedTool deserialization.

```bash
GALAXY_ROOT=/path/to/galaxy make sync-golden
```

Source: `$GALAXY_ROOT/test/unit/tool_util/workflow_state/`

### Parameter Specification

The parameter spec file defines expected validation behavior for all Galaxy parameter types across state representations.

```bash
GALAXY_ROOT=/path/to/galaxy make sync-param-spec
```

Source: `$GALAXY_ROOT/test/unit/tool_util/parameter_specification.yml`

### Workflow Fixtures

Synthetic workflow files (format2 + native) for normalization and roundtrip tests.

```bash
GXFORMAT2_ROOT=/path/to/gxformat2 make sync-workflow-fixtures
GXFORMAT2_ROOT=/path/to/gxformat2 make sync-workflow-expectations
```

### Schema Sources

Schema-salad YAML definitions for workflow schema generation.

```bash
GXFORMAT2_ROOT=/path/to/gxformat2 make sync-schema-sources
```

### Checking Sync Status

```bash
# Check if fixtures have diverged from upstream
GXFORMAT2_ROOT=/path/to/gxformat2 make check-sync
```

## Verify Golden Checksums

Verify fixture integrity without needing a Galaxy checkout:

```bash
make verify-golden
```
