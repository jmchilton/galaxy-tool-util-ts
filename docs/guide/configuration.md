# Configuration Reference

## Environment Variables

| Variable | Default | Used By | Description |
|---|---|---|---|
| `GALAXY_TOOL_CACHE_DIR` | `~/.galaxy/tool_info_cache` | core, cli, tool-cache-proxy | Override the [tool cache](glossary#tool-cache) directory |
| `GALAXY_TOOLSHED_URL` | `https://toolshed.g2.bx.psu.edu` | core, cli | Override the default [ToolShed](https://toolshed.g2.bx.psu.edu) URL |

## CLI Flags

### galaxy-tool-cache

All commands accept `--cache-dir <dir>` to override the cache directory.

| Command | Flag | Default | Description |
|---|---|---|---|
| `add` | `--version <ver>` | — | Tool version |
| `add` | `--galaxy-url <url>` | — | Galaxy instance URL for fallback |
| `list` | `--json` | `false` | JSON output |
| `info` | `--version <ver>` | — | Tool version |
| `schema` | `--version <ver>` | — | Tool version |
| `schema` | `--representation <rep>` | `workflow_step` | [State representation](glossary#state-representations) |
| `schema` | `--output <file>` | stdout | Output file |

### gxwf validate

| Flag | Default | Description |
|---|---|---|
| `--format <fmt>` | auto-detect | `native` or `format2` |
| `--no-tool-state` | `false` | Skip [tool state](glossary#tool-state) validation |
| `--cache-dir <dir>` | `~/.galaxy/tool_info_cache` | Tool cache directory |
| `--mode <mode>` | `effect` | `effect` or `json-schema` |
| `--tool-schema-dir <dir>` | — | Pre-exported schema directory |

## Server Config (YAML)

See [Proxy Server Setup](guide/proxy-server.md) for full config file documentation.

| Key | Type | Default | Description |
|---|---|---|---|
| `galaxy.workflows.toolSources` | `ToolSource[]` | `[]` | Tool sources (toolshed or galaxy) |
| `galaxy.workflows.toolCache.directory` | `string` | `~/.galaxy/tool_info_cache` | Cache directory |
| `port` | `number` | `8080` | Server port |
| `host` | `string` | `127.0.0.1` | Bind address |

## Precedence

For the cache directory:
1. Explicit `--cache-dir` CLI flag or `cacheDir` constructor option
2. `GALAXY_TOOL_CACHE_DIR` environment variable
3. Default: `~/.galaxy/tool_info_cache`

For the ToolShed URL:
1. URL embedded in tool ID (e.g., `toolshed.g2.bx.psu.edu/repos/...`)
2. `sources` option / config file
3. `GALAXY_TOOLSHED_URL` environment variable
4. Default: `https://toolshed.g2.bx.psu.edu`
