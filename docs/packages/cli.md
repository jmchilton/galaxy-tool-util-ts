# @galaxy-tool-util/cli

Two CLI tools:
- **`galaxy-tool-cache`** — cache and inspect [Galaxy](https://galaxyproject.org) tool metadata
- **`gxwf`** — validate, clean, lint, and convert Galaxy workflow files

## galaxy-tool-cache

### Commands

### `add <tool_id>`

Fetch a tool from [ToolShed](https://toolshed.g2.bx.psu.edu) or Galaxy and cache it locally.

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

Export a [JSON Schema](https://json-schema.org) for a tool's parameters at a given [state representation](glossary#state-representations).

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

### `populate-workflow <file>`

Scan a workflow file, extract all tool references, and cache each one.

```bash
# Cache all tools referenced in a workflow
galaxy-tool-cache populate-workflow my-workflow.ga

# With Galaxy fallback for tools not on ToolShed
galaxy-tool-cache populate-workflow my-workflow.gxwf.yml --galaxy-url https://usegalaxy.org
```

| Option | Description |
|---|---|
| `--cache-dir <dir>` | Cache directory |
| `--galaxy-url <url>` | Galaxy instance URL for fallback fetching |

### `structural-schema`

Export the structural [JSON Schema](https://json-schema.org) for Galaxy workflow files. Enables external tooling to validate workflow structure without the TS runtime.

```bash
# Format2 schema (default)
galaxy-tool-cache structural-schema

# Native format schema, write to file
galaxy-tool-cache structural-schema --format native --output native-schema.json
```

| Option | Description |
|---|---|
| `--format <fmt>` | Workflow format: `format2` (default) or `native` |
| `--output <file>` | Write to file instead of stdout |

## gxwf

Unified CLI for Galaxy workflow operations. Replaces the standalone `galaxy-workflow-validate` binary.

### Single-file commands

### `validate <file>`

Validate a Galaxy workflow file — structure and optionally [tool state](glossary#tool-state) against cached tool schemas.

```bash
# Full validation (structure + tool state)
gxwf validate my-workflow.ga

# Structure only
gxwf validate my-workflow.ga --no-tool-state

# JSON Schema validation backend
gxwf validate my-workflow.ga --mode json-schema
```

| Option | Description |
|---|---|
| `--format <fmt>` | Force format: `native` or [`format2`](glossary#format2) (auto-detected by default) |
| `--no-tool-state` | Skip tool state validation |
| `--cache-dir <dir>` | Tool cache directory |
| `--mode <mode>` | Validation backend: `effect` (default) or `json-schema` |
| `--tool-schema-dir <dir>` | Directory of pre-exported per-tool JSON Schemas |

### `clean <file>`

Strip stale bookkeeping keys and decode legacy JSON-encoded `tool_state` strings.

```bash
# Clean to stdout
gxwf clean my-workflow.ga

# Write to file
gxwf clean my-workflow.ga --output cleaned.ga

# Show diff of changes
gxwf clean my-workflow.ga --diff
```

| Option | Description |
|---|---|
| `--output <file>` | Write cleaned workflow to file (default: stdout) |
| `--diff` | Show unified diff of changes instead of writing output |
| `--format <fmt>` | Force format (auto-detected by default) |

### `lint <file>`

Unified lint combining structural checks, best practices, and tool state validation.

```bash
# Full lint
gxwf lint my-workflow.ga

# Skip best practice checks (annotations, creators, license)
gxwf lint my-workflow.ga --skip-best-practices

# Skip tool state validation
gxwf lint my-workflow.ga --skip-state-validation

# JSON output for CI
gxwf lint my-workflow.ga --json
```

Three phases, each independently skippable:
1. **Structural lint** — always runs
2. **Best practices** — annotation, creator, license, label checks (skip with `--skip-best-practices`)
3. **Tool state validation** — validates against cached tool definitions (skip with `--skip-state-validation`)

Exit codes: 0 = clean, 1 = warnings only, 2 = errors.

| Option | Description |
|---|---|
| `--skip-best-practices` | Skip annotation/creator/license/label checks |
| `--skip-state-validation` | Skip tool state validation |
| `--cache-dir <dir>` | Tool cache directory (for state validation) |
| `--format <fmt>` | Force format (auto-detected by default) |
| `--json` | Output structured JSON result |

### `convert <file>`

Convert between native (`.ga`) and [format2](glossary#format2) (`.gxwf.yml`) formats.

```bash
# Auto-detect direction (native→format2 or format2→native)
gxwf convert my-workflow.ga

# Explicit target
gxwf convert my-workflow.ga --to format2

# Compact output (no position info)
gxwf convert my-workflow.ga --to format2 --compact

# Force JSON output
gxwf convert my-workflow.gxwf.yml --to native --json
```

| Option | Description |
|---|---|
| `--to <format>` | Target format: `native` or `format2` (infers opposite by default) |
| `--output <file>` | Write to file (default: stdout) |
| `--compact` | Omit position info in format2 output |
| `--json` | Force JSON output |
| `--yaml` | Force YAML output |
| `--format <fmt>` | Force source format (auto-detected by default) |
| `--stateful` | Use cached tool definitions for schema-aware state re-encoding |
| `--cache-dir <dir>` | Tool cache directory (for `--stateful`) |

With `--stateful`, scalar types are coerced (`"42"` → `42`), stale bookkeeping keys stripped, and connection/runtime markers routed into the format2 `in` block. Per-step failures fall back to schema-free passthrough and are reported to stderr. Exit code 1 if any step fell back.

### `roundtrip <file>`

Roundtrip-validate a native workflow: convert native → format2 → native via stateful conversion, then diff the original and reimported `tool_state` per step. Benign diffs (type coercions, stale-key stripping, connection moves) are distinguished from real state corruption.

```bash
# Single file
gxwf roundtrip my-workflow.ga --cache-dir ~/.cache/galaxy-tools

# Structured JSON report
gxwf roundtrip my-workflow.ga --json
```

Source must be a native (`.ga`) file — format2 inputs are rejected.

| Option | Description |
|---|---|
| `--cache-dir <dir>` | Tool cache directory |
| `--format <fmt>` | Force source format (must resolve to native) |
| `--json` | Output structured JSON report |

Exit codes: 0 = clean, 1 = benign diffs only, 2 = real diffs or conversion errors.

### Tree (batch) commands

Tree commands take a directory instead of a file, discover all workflows recursively, process each, and report aggregate results. They mirror the Python `gxwf-*-tree` commands.

Workflow discovery scans for `.ga`, `.gxwf.yml`, `.gxwf.yaml`, `.json`, and `.yml`/`.yaml` files, then checks content markers (`a_galaxy_workflow` for native, `class: GalaxyWorkflow` for format2). Directories like `.git`, `node_modules`, and `.venv` are excluded.

### `validate-tree <dir>`

Batch validate all workflows under a directory.

```bash
gxwf validate-tree ./workflows/
gxwf validate-tree ./workflows/ --json
gxwf validate-tree ./workflows/ --mode json-schema
```

| Option | Description |
|---|---|
| `--format <fmt>` | Force format (auto-detected by default) |
| `--no-tool-state` | Skip tool state validation |
| `--cache-dir <dir>` | Tool cache directory |
| `--mode <mode>` | Validation backend: `effect` (default) or `json-schema` |
| `--tool-schema-dir <dir>` | Directory of pre-exported per-tool JSON Schemas |
| `--json` | Output structured JSON report |

### `lint-tree <dir>`

Batch lint all workflows under a directory.

```bash
gxwf lint-tree ./workflows/
gxwf lint-tree ./workflows/ --skip-best-practices --json
```

| Option | Description |
|---|---|
| `--skip-best-practices` | Skip annotation/creator/license/label checks |
| `--skip-state-validation` | Skip tool state validation |
| `--cache-dir <dir>` | Tool cache directory |
| `--format <fmt>` | Force format (auto-detected by default) |
| `--json` | Output structured JSON report |

### `clean-tree <dir>`

Batch clean all workflows under a directory.

```bash
# Report which files would change
gxwf clean-tree ./workflows/

# Write cleaned files to output directory (mirrors source tree)
gxwf clean-tree ./workflows/ --output-dir ./cleaned/
```

Exit code 1 if any workflows had stale keys (useful for CI).

| Option | Description |
|---|---|
| `--output-dir <dir>` | Write cleaned workflows to directory (mirrors source tree) |
| `--format <fmt>` | Force format (auto-detected by default) |
| `--json` | Output structured JSON report |

### `convert-tree <dir>`

Batch convert all workflows under a directory.

```bash
# Convert all native workflows to format2
gxwf convert-tree ./workflows/ --to format2 --output-dir ./converted/

# Auto-detect direction per file
gxwf convert-tree ./workflows/ --output-dir ./converted/
```

| Option | Description |
|---|---|
| `--to <format>` | Target format (infers opposite by default) |
| `--output-dir <dir>` | Output directory (required) |
| `--compact` | Omit position info in format2 output |
| `--report-json` | Output structured JSON report |
| `--json` | Force JSON output for converted files |
| `--yaml` | Force YAML output |
| `--format <fmt>` | Force source format (auto-detected by default) |
| `--stateful` | Use cached tool definitions for schema-aware state re-encoding |
| `--cache-dir <dir>` | Tool cache directory (for `--stateful`) |

With `--stateful`, the shared tool cache is loaded once and reused across all files. Each file reports its per-step conversion count (e.g. `[stateful 3/4]`) and aggregate fallback totals. Exit code 1 if any step fell back.

### `roundtrip-tree <dir>`

Batch roundtrip-validate native workflows under a directory. Format2 files are skipped.

```bash
gxwf roundtrip-tree ./workflows/ --cache-dir ~/.cache/galaxy-tools
gxwf roundtrip-tree ./workflows/ --json
```

| Option | Description |
|---|---|
| `--cache-dir <dir>` | Tool cache directory |
| `--format <fmt>` | Force source format (must resolve to native) |
| `--json` | Output structured JSON report |

Exit codes: 0 = all files clean, 1 = benign diffs only, 2 = any file has real diffs or conversion errors.
