# galaxy-tool-util-ts

TypeScript port of Galaxy's `tool_util` — Effect Schema parameter types, tool cache, CLI, and proxy server.

## Structure

pnpm monorepo with 4 packages:

- **schema** — Effect Schema definitions for all Galaxy parameter types
- **core** — ParsedTool model, cache layer, ToolShed/Galaxy API client
- **cli** — `galaxy-tool-cache` CLI (add/list/info/clear/schema)
- **tool-cache-proxy** — proxy server mirroring ToolShed API with YAML config + CORS

## Setup

```bash
pnpm install
```

## Development

```bash
make check    # lint + format + typecheck
make test     # run all tests
make fix      # auto-fix lint + format issues
```

## Golden Cache Fixtures

Cross-language contract tests use golden fixtures generated from real ToolShed API responses.
The canonical source is in the Galaxy repo — sync them here with:

```bash
GALAXY_ROOT=/path/to/galaxy make sync-golden
```

`GALAXY_ROOT` should point to a Galaxy checkout containing the golden cache test data
at `test/unit/tool_util/workflow_state/cache_golden/`.

After syncing, run `make test` to verify the TS cache layer produces identical results
to Python for cache key computation, tool ID parsing, and ParsedTool deserialization.
