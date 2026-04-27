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
| `--strict` | Shorthand for `--strict-structure --strict-encoding --strict-state` |
| `--strict-structure` | Reject unknown keys at envelope/step level |
| `--strict-encoding` | Reject JSON-string `tool_state`; reject `tool_state` field in format2 steps |
| `--strict-state` | Require every tool step to validate; no skips allowed |
| `--json` | Output structured JSON report |
| `--report-html [file]` | Write HTML report to file (or stdout if omitted) |

### `validate-tests <file>`

Validate a workflow-test file (`*-tests.yml`, `*.gxwf-tests.yml`) against the Galaxy Tests schema. Optionally cross-checks job inputs and output assertions against a paired workflow.

```bash
gxwf validate-tests my-workflow-tests.yml
gxwf validate-tests my-workflow-tests.yml --workflow my-workflow.gxwf.yml
gxwf validate-tests my-workflow-tests.yml --json
```

| Option | Description |
|---|---|
| `--workflow <path>` | Cross-check job inputs + output assertions against a workflow (`.ga` / `.gxwf.yml`) |
| `--json` | Output structured JSON report |

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
| `--json` | Output structured JSON report |
| `--report-html [file]` | Write HTML report to file (or stdout if omitted) |
| `--skip-uuid` | Skip stripping `uuid` fields (errors are always stripped) |

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
| `--strict` | Shorthand for `--strict-structure --strict-encoding --strict-state` |
| `--strict-structure` | Reject unknown keys at envelope/step level |
| `--strict-encoding` | Reject JSON-string `tool_state`; reject `tool_state` field in format2 steps |
| `--strict-state` | Require every tool step to validate; no skips allowed |
| `--json` | Output structured JSON result |
| `--report-html [file]` | Write HTML report to file (or stdout if omitted) |

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
| `--errors-only` | Suppress benign diffs and clean steps from text output |
| `--benign-only` | Show only steps with benign diffs (no errors, no failures) |
| `--brief` | Omit per-diff list; show only the one-line summary |

Exit codes: 0 = clean, 1 = benign diffs only, 2 = real diffs or conversion errors.
Filter flags affect only the text report — exit codes are unchanged.

### `mermaid <file> [output]`

Render a Galaxy workflow as a [Mermaid](https://mermaid.js.org) flowchart diagram. The `output` positional path infers the format by extension: `.mmd` writes raw Mermaid, `.md` writes a fenced code block. With no `output`, raw Mermaid is written to stdout.

```bash
# Print raw Mermaid to stdout
gxwf mermaid my-workflow.ga

# Write raw Mermaid file
gxwf mermaid my-workflow.ga diagram.mmd

# Write Markdown with fenced code block
gxwf mermaid my-workflow.ga diagram.md

# Render frame comments as subgraphs
gxwf mermaid my-workflow.gxwf.yml --comments
```

| Option | Description |
|---|---|
| `--comments` | Render frame comments as Mermaid subgraphs |
| `--annotate-connections` | Encode map-over depth + reductions on edges (runs the connection validator) |
| `--cache-dir <dir>` | Tool cache directory (used by `--annotate-connections`) |

With `--annotate-connections`, the emitter runs the connection validator and styles each edge by its map-over depth or reduction:

| Annotation | Mermaid edge |
|---|---|
| `map_depth = 0`, no reduction | `A --> B` (default) |
| `map_depth ≥ 1` | `A ==>\|"<mapping>"\| B` (thick green; width grows with depth) |
| `reduction = true` | `A -. "reduce" .-> B` (dashed red) |

A consolidated `linkStyle` block is emitted at the bottom of the diagram.

### `cytoscapejs <file> [output]`

Render a Galaxy workflow as [Cytoscape.js](https://js.cytoscape.org) elements — either JSON for programmatic use or a standalone HTML viewer with hover tooltips. Output format is inferred from extension (`.json` / `.html`) or forced via `--json` / `--html`. With no `output`, JSON is written to stdout.

This is the TS port of gxformat2's `gxwf-viz`. The JSON shape (snake_case keys, edge id format) is byte-identical to the Python emitter; the HTML template is synced verbatim.

```bash
# Print JSON elements to stdout
gxwf cytoscapejs my-workflow.ga

# Write JSON
gxwf cytoscapejs my-workflow.ga elements.json

# Write standalone interactive HTML
gxwf cytoscapejs my-workflow.ga viewer.html

# Force HTML output regardless of extension
gxwf cytoscapejs my-workflow.gxwf.yml out --html
```

| Option | Description |
|---|---|
| `--html` | Force HTML output |
| `--json` | Force JSON output |
| `--annotate-connections` | Encode map-over depth + reductions on edges (runs the connection validator) |
| `--cache-dir <dir>` | Tool cache directory (used by `--annotate-connections`) |

With `--annotate-connections`, each edge gains `data.map_depth`, `data.reduction`, `data.mapping` and the classes `mapover_<depth>` / `reduction`. The bundled HTML viewer renders mapped edges as thicker green lines and reductions as dashed red arrows, and surfaces the depth/reduction in edge tooltips.

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
| `--strict` | Shorthand for all strict flags |
| `--strict-structure` | Reject unknown keys |
| `--strict-encoding` | Reject legacy encoding |
| `--strict-state` | No skipped steps allowed |
| `--json` | Output structured JSON report |
| `--report-markdown [file]` | Write Markdown report to file (or stdout if omitted) |
| `--report-html [file]` | Write HTML report to file (or stdout if omitted) |

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
| `--strict` | Shorthand for all strict flags |
| `--strict-structure` | Reject unknown keys |
| `--strict-encoding` | Reject legacy encoding |
| `--strict-state` | No skipped steps allowed |
| `--json` | Output structured JSON report |
| `--report-markdown [file]` | Write Markdown report to file (or stdout if omitted) |
| `--report-html [file]` | Write HTML report to file (or stdout if omitted) |

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
| `--report-markdown [file]` | Write Markdown report to file (or stdout if omitted) |
| `--report-html [file]` | Write HTML report to file (or stdout if omitted) |
| `--skip-uuid` | Skip stripping `uuid` fields (errors are always stripped) |

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
| `--strict` | Shorthand for all strict flags |
| `--strict-structure` | Reject unknown keys |
| `--strict-encoding` | Reject legacy encoding |
| `--strict-state` | No skipped steps allowed |
| `--json` | Output structured JSON report |
| `--errors-only` | List only files with errors or failures |
| `--benign-only` | List only files with benign diffs (no errors, no failures) |
| `--brief` | Omit per-file lines; print only the aggregate summary |
| `--report-markdown [file]` | Write Markdown report to file (or stdout if omitted) |
| `--report-html [file]` | Write HTML report to file (or stdout if omitted) |

Exit codes: 0 = all files clean, 1 = benign diffs only, 2 = any file has real diffs or conversion errors.
Filter flags affect only the text report — exit codes are unchanged.

### `validate-tests-tree <dir>`

Batch validate workflow-test files (`*-tests.yml` / `*.gxwf-tests.yml`) under a directory.

```bash
gxwf validate-tests-tree ./workflows/
gxwf validate-tests-tree ./workflows/ --auto-workflow
gxwf validate-tests-tree ./workflows/ --json
```

| Option | Description |
|---|---|
| `--json` | Output structured JSON report |
| `--auto-workflow` | Pair each tests file with a sibling workflow by filename convention (`foo.gxwf-tests.yml` ↔ `foo.gxwf.yml` / `foo.ga`) and cross-check inputs/outputs |

### Tool Shed discovery commands

Instance-agnostic discovery against [`toolshed.g2.bx.psu.edu`](https://toolshed.g2.bx.psu.edu).
Designed to feed `galaxy-tool-cache add` so a workflow author can go from a query string
to a cached `ParsedTool` in three commands. All commands accept both the TRS form
(`owner~repo~tool_id`) and the pretty form (`owner/repo/tool_id`) where a `<tool-id>`
argument is taken.

Common exit-code convention: `0` = at least one hit, `2` = empty result, `3` = HTTP / fetch error.

### `tool-search <query>`

Search the Tool Shed for tools matching a free-text query.

```bash
gxwf tool-search fastqc
gxwf tool-search "quality control" --json --max-results 10
```

| Option | Description |
|---|---|
| `--page-size <n>` | Server-side page size (default `20`) |
| `--max-results <n>` | Hard cap on hits returned (default `50`) |
| `--page <n>` | Starting page (1-indexed; default `1`) |
| `--owner <user>` | Restrict to one repo owner (client-side; tool-search has no server `owner:` keyword) |
| `--match-name` | Drop hits where the query is not a token in the tool name |
| `--json` | Emit `{ query, hits: [NormalizedToolHit, ...] }` |
| `--enrich` | Resolve each hit's `ParsedTool` (one fetch per hit) and attach it as `parsedTool` on each JSON hit. Off by default. Best for skills that pick the top 1–3 results; wasteful for broad/paged exploration. |
| `--cache-dir <dir>` | Tool cache directory used by `--enrich`. Defaults to the same location as `galaxy-tool-cache`. |

The Tool Shed wraps queries with `*term*` server-side, so noisy queries can match
description/help text. Combine `--match-name` with `--owner` to tighten ranking
when triaging by hand. For repository-level discovery (where `owner:` and
`category:` reserved keywords *are* honored server-side), see `repo-search`.

### `repo-search <query>`

Search the Tool Shed for **repositories** rather than individual tools. Different
endpoint (`/api/repositories?q=`), different ranking (popularity-boosted by
`times_downloaded`), and supports server-side `owner:` / `category:` reserved
keywords. Better for "find me a *package* about X"; tool-search remains better
for "find me a specific tool by exact name."

```bash
gxwf repo-search fastqc
gxwf repo-search fastqc --owner devteam --json
gxwf repo-search alignment --category "sequence analysis"
```

| Option | Description |
|---|---|
| `--page-size <n>` | Server-side page size (default `20`) |
| `--max-results <n>` | Hard cap on hits returned (default `50`) |
| `--page <n>` | Starting page (1-indexed; default `1`) |
| `--owner <user>` | Restrict via the server-side `owner:` keyword |
| `--category <name>` | Restrict via the server-side `category:` keyword (whitespace is auto-quoted) |
| `--json` | Emit `{ query, filters, hits: [NormalizedRepoHit, ...] }` |

### `tool-versions <tool-id>`

List TRS-published versions of a Tool Shed tool, oldest first (newest last).

```bash
gxwf tool-versions devteam/fastqc/fastqc
gxwf tool-versions devteam~fastqc~fastqc --latest
gxwf tool-versions devteam/fastqc/fastqc --json
```

| Option | Description |
|---|---|
| `--latest` | Print only the newest version |
| `--json` | Emit `{ trsToolId, versions: [...] }` |

Note: TRS dedupes by version string, so if multiple changesets publish the same version
you'll only see it once. Use `tool-revisions` to see the full set of changesets.

### `tool-revisions <tool-id>`

Resolve a tool to the changeset revisions that publish it, ordered oldest→newest by
`get_ordered_installable_revisions`. Needed when emitting a workflow that pins
`(name, owner, changeset_revision)` for reproducible reinstall.

```bash
gxwf tool-revisions devteam/fastqc/fastqc --json
gxwf tool-revisions devteam/fastqc/fastqc --tool-version 0.74+galaxy0 --latest
```

| Option | Description |
|---|---|
| `--tool-version <v>` | Restrict to revisions that publish this exact tool version |
| `--latest` | Print only the newest matching revision |
| `--json` | Emit `{ trsToolId, version?, revisions: [{ changesetRevision, toolVersion }] }` |

The flag is `--tool-version` rather than `--version` because commander's program-level
`--version` flag intercepts.

Caveat: tool version strings are not monotonic — two changesets can legally publish the
same `version` with different content. When pinning, prefer the newest matching revision.
