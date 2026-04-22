# Testing

## Test Runner

Unit and integration tests use [Vitest](https://vitest.dev/). End-to-end tests for `gxwf-web` + `gxwf-ui` use [Playwright](https://playwright.dev/) and live in `packages/gxwf-e2e/`.

```bash
# Run all tests
pnpm -r test

# Run tests for a specific package
cd packages/schema && pnpm test
cd packages/core && pnpm test
```

## Cross-Layer Integration Tests

`packages/integration-tests/` (private, unpublished) is the home for tests that exercise more than one published package together — e.g. schema's `ToolStateValidator` driven by core's real `ToolInfoService` and on-disk `ToolCache`. Keeping them out of individual packages preserves a strict one-way dep graph (`schema ← core ← …`) — no package needs a test-time dep back on a consumer, so pnpm sees no cycles.

Shared helpers and fixtures are symlinked into `packages/integration-tests/test/` from their source-of-truth package (usually `packages/schema/test/`) to avoid duplication.

## End-to-End Tests

The `@galaxy-tool-util/gxwf-e2e` package drives the built `gxwf-ui` bundle against an in-process `gxwf-web` via Playwright. Default runs exercise the Vue app only; Monaco-backed specs self-skip unless a local extension fixture is present, so fresh clones and CI stay Monaco-free.

```bash
# Full e2e suite
pnpm --filter @galaxy-tool-util/gxwf-e2e test

# Skip the implicit gxwf-ui rebuild when iterating locally
GXWF_E2E_SKIP_UI_BUILD=1 pnpm --filter @galaxy-tool-util/gxwf-e2e test
```

See [End-to-End Tests](development/e2e-testing.md) for the harness, the opt-in Monaco specs and how to produce the fixture, shared helpers, the CSS scoping regression guard, and the upgrade procedures for `@codingame/monaco-vscode-*` and `galaxy-workflows-vscode`. The architectural context for those specs — CSP, monaco-vscode-api pitfalls, CSS scoping rationale — lives in [gxwf-ui Frontend](architecture/gxwf-ui.md).

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
