# galaxy-tool-util-ts

TypeScript port of Galaxy's `tool_util` — Effect Schema parameter types, tool cache, CLI, and proxy server.

**[Documentation](https://jmchilton.github.io/galaxy-tool-util-ts/)**

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

## Fixture Syncing

Test fixtures are synced from upstream [Galaxy](https://github.com/galaxyproject/galaxy) and [gxformat2](https://github.com/galaxyproject/gxformat2) repos. Sync everything, regenerate schemas, and verify checksums in one step:

```bash
GALAXY_ROOT=/path/to/galaxy GXFORMAT2_ROOT=/path/to/gxformat2 make sync
```

See the [testing docs](https://jmchilton.github.io/galaxy-tool-util-ts/#/development/testing) for individual targets.
