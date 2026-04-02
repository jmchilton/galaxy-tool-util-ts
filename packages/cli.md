# @galaxy-tool-util/cli

Two CLI tools:
- **`galaxy-tool-cache`** — cache and inspect Galaxy tool metadata
- **`galaxy-workflow-validate`** — validate Galaxy workflow files

## galaxy-tool-cache

### Commands

### `add <tool_id>`

Fetch a tool from ToolShed or Galaxy and cache it locally.

```bash
galaxy-tool-cache add toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc --version 0.74+galaxy0
galaxy-tool-cache add toolshed.g2.bx.psu.edu/repos/iuc/bcftools_norm/bcftools_norm --version 1.15.1+galaxy3
```

| Option | Description |
|---|---|
| `--version <ver>` | Tool version (required for ToolShed tools) |
| `--cache-dir <dir>` | Override cache directory |
| `--galaxy-url <url>` | Galaxy instance URL for fallback fetching |

### `list`

List all cached tools.

```bash
galaxy-tool-cache list
galaxy-tool-cache list --json
```

| Option | Description |
|---|---|
| `--json` | Output as JSON array |
| `--cache-dir <dir>` | Override cache directory |

### `info <tool_id>`

Show metadata for a cached tool.

```bash
galaxy-tool-cache info toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc --version 0.74+galaxy0
```

| Option | Description |
|---|---|
| `--version <ver>` | Tool version |
| `--cache-dir <dir>` | Override cache directory |

### `clear [prefix]`

Clear cached tools. Optionally filter by prefix.

```bash
# Clear everything
galaxy-tool-cache clear

# Clear only fastqc tools
galaxy-tool-cache clear fastqc
```

| Option | Description |
|---|---|
| `--cache-dir <dir>` | Override cache directory |

### `schema <tool_id>`

Export a JSON Schema for a tool's parameters at a given state representation.

```bash
# Default: workflow_step representation, stdout
galaxy-tool-cache schema toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc --version 0.74+galaxy0

# Different representation, write to file
galaxy-tool-cache schema toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc \
  --version 0.74+galaxy0 \
  --representation workflow_step_linked \
  --output fastqc-schema.json
```

| Option | Description |
|---|---|
| `--version <ver>` | Tool version |
| `--representation <rep>` | State representation (default: `workflow_step`) |
| `--output <file>` | Write to file instead of stdout |
| `--cache-dir <dir>` | Override cache directory |

## galaxy-workflow-validate

Standalone CLI for validating Galaxy workflow files. Checks structure and optionally validates tool state against cached tool schemas.

```bash
# Full validation (structure + tool state)
galaxy-workflow-validate my-workflow.ga

# Format2 workflow
galaxy-workflow-validate my-workflow.gxwf.yml

# Skip tool state validation
galaxy-workflow-validate my-workflow.ga --no-tool-state

# JSON Schema validation backend
galaxy-workflow-validate my-workflow.ga --mode json-schema

# Offline mode with pre-exported schemas
galaxy-workflow-validate my-workflow.ga \
  --mode json-schema \
  --tool-schema-dir ./schemas/
```

| Option | Description |
|---|---|
| `--format <fmt>` | Force format: `native` or `format2` (auto-detected by default) |
| `--no-tool-state` | Skip tool state validation |
| `--cache-dir <dir>` | Tool cache directory |
| `--mode <mode>` | Validation backend: `effect` (default) or `json-schema` |
| `--tool-schema-dir <dir>` | Directory of pre-exported per-tool JSON Schemas |
