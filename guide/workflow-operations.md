# Workflow Operations

End-to-end guide for validating, cleaning, linting, and converting [Galaxy](https://galaxyproject.org) workflow files using `gxwf`. For background on state representations, tool state, and why parameter shapes vary by context, see [How It Works](architecture/overview.md).

## Overview

The `gxwf` CLI provides five operations on workflow files, each available in single-file and batch (tree) modes:

| Operation | Single-file | Batch | Purpose |
|---|---|---|---|
| **Validate** | `gxwf validate` | `gxwf validate-tree` | Structure + tool state validation |
| **Clean** | `gxwf clean` | `gxwf clean-tree` | Strip stale keys, decode legacy encoding |
| **Lint** | `gxwf lint` | `gxwf lint-tree` | Structural checks + best practices + state validation |
| **Convert** | `gxwf convert` | `gxwf convert-tree` | Native <-> format2 conversion (schema-free or `--stateful`) |
| **Roundtrip** | `gxwf roundtrip` | `gxwf roundtrip-tree` | Native → format2 → native fidelity check |

## Validation

Workflow validation has two layers:

1. **Structure validation** — does the workflow conform to the Galaxy workflow schema ([Format2](glossary#format2) or native)?
2. **Tool state validation** — does each step's `tool_state` match the expected parameter schema for that tool?

### CLI Usage

```bash
# Full validation (structure + tool state)
gxwf validate my-workflow.ga

# Structure only
gxwf validate my-workflow.ga --no-tool-state
```

### Format Detection

The CLI auto-detects the workflow format:
- `.ga` files are treated as native format
- `.gxwf.yml` / `.gxwf.yaml` files are treated as format2

Override with `--format native` or `--format format2`.

### Strict Validation

By default, validation is lenient — unknown keys are tolerated and legacy-encoded state is allowed. Use strict flags to harden CI:

```bash
gxwf validate my-workflow.ga --strict             # all strict checks
gxwf validate my-workflow.ga --strict-structure   # reject unknown keys
gxwf validate my-workflow.ga --strict-encoding    # reject JSON-string tool_state / format2 field misuse
gxwf validate my-workflow.ga --strict-state       # no skipped steps allowed
```

See [Strict Validation](guide/workflow-validation.md#strict-validation) for the full flag reference. These flags apply to `validate`, `lint`, `convert`, `roundtrip`, and their `-tree` variants.

### Validation Backends

Two backends are available for [tool state](glossary#tool-state) validation:

**Effect mode** (default):
```bash
gxwf validate my-workflow.ga --mode effect
```
Uses [Effect](https://effect.website) Schema directly for validation. Full type-level validation with rich error messages.

**JSON Schema mode**:
```bash
gxwf validate my-workflow.ga --mode json-schema
```
Exports Effect Schemas to [JSON Schema](https://json-schema.org), then validates with [Ajv](https://ajv.js.org). Useful for interop with other JSON Schema tools.

### Offline Validation

For CI or air-gapped environments, pre-export tool schemas and validate without network access:

```bash
# Step 1: Export schemas for all tools in the workflow
galaxy-tool-cache schema toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc \
  --version 0.74+galaxy0 \
  --output schemas/fastqc-0.74.json

# Step 2: Validate using pre-exported schemas
gxwf validate my-workflow.ga \
  --mode json-schema \
  --tool-schema-dir ./schemas/
```

## Cleaning

Cleaning strips stale bookkeeping keys (like `__page__`, `__rerun_remap_job_id__`, `chromInfo`) from `tool_state` and decodes legacy JSON-encoded state strings into structured objects.

```bash
# Preview cleaned output on stdout
gxwf clean my-workflow.ga

# Write to file (use same path for in-place)
gxwf clean my-workflow.ga --output cleaned.ga

# Show diff of changes
gxwf clean my-workflow.ga --diff
```

Clean before validating — stale keys can cause spurious validation failures. The typical CI workflow is:

```bash
gxwf clean-tree ./workflows/ --output-dir ./workflows/  # in-place clean
gxwf validate-tree ./workflows/                          # validate cleaned workflows
```

> **Note:** The current cleaning implementation strips a hardcoded set of known stale keys. The Python version also supports schema-aware key classification (keys not in the tool definition). This is a known gap.

## Linting

`gxwf lint` is a superset of validation — it combines structural checks, best practice checks, and tool state validation in one pass. It's the recommended command for CI pipelines.

```bash
# Full lint (all three phases)
gxwf lint my-workflow.ga

# Structural + state only (skip best practice opinions)
gxwf lint my-workflow.ga --skip-best-practices

# Structural + best practices only (no tool cache needed)
gxwf lint my-workflow.ga --skip-state-validation

# Structural only
gxwf lint my-workflow.ga --skip-best-practices --skip-state-validation
```

### Lint Phases

1. **Structural lint** — always runs. Checks output definitions, step errors, subworkflow structure.
2. **Best practices** — checks for annotations, creator metadata, license, labels, disconnected inputs, untyped parameters. Skippable with `--skip-best-practices`.
3. **Tool state validation** — validates each step's state against cached tool schemas. Requires populated tool cache. Skippable with `--skip-state-validation`. Degrades gracefully if the cache is empty.

### Exit Codes

| Code | Meaning |
|---|---|
| 0 | Clean — no errors or warnings |
| 1 | Warnings only (e.g. missing best practice annotations) |
| 2 | Errors (structural problems or tool state failures) |

### Relationship to Validate

`gxwf lint --skip-best-practices` is functionally equivalent to `gxwf validate`. Both commands are kept because the mental model is distinct: "is this valid?" vs "does this meet quality standards?"

## Format Conversion

Convert between native (`.ga`) and format2 (`.gxwf.yml`) formats.

```bash
# Auto-detect direction (native→format2 or format2→native)
gxwf convert my-workflow.ga

# Explicit target
gxwf convert my-workflow.ga --to format2

# Compact format2 (strip position info)
gxwf convert my-workflow.ga --to format2 --compact --output my-workflow.gxwf.yml
```

By default this is the schema-free conversion path — it mirrors Python's `gxwf-to-format2` / `gxwf-to-native`. It does not use tool definitions for state conversion.

### When to Convert

- **native → format2**: For version control friendliness (YAML diffs better than JSON), human readability, and IWC compatibility.
- **format2 → native**: For importing into Galaxy instances that expect native format, or for testing roundtrip fidelity.

### Schema-free vs Stateful

Conversion has two modes:

**Schema-free** (default): `tool_state` is copied between formats as-is. Fast, no tool cache dependency, but lossy — native state may contain stale bookkeeping keys, string-typed numbers, comma-delimited multi-selects, or ConnectedValue/RuntimeValue markers that remain in the output.

**Stateful** (`--stateful`): walks the parameter tree using cached tool definitions to strip stale keys, coerce scalar types, separate connection/runtime markers into the format2 `in` block, and emit clean `state` dicts. Per-step failures (tool not in cache, invalid state) fall back to schema-free passthrough and are reported to stderr.

```bash
# Stateful conversion — requires populated tool cache
gxwf convert my-workflow.ga --to format2 --stateful
gxwf convert-tree ./workflows/ --to format2 --stateful --output-dir ./converted/

# Share a cache directory across runs
gxwf convert my-workflow.ga --to format2 --stateful --cache-dir ~/.cache/galaxy-tools
```

Populate the cache first with `galaxy-tool-cache populate-workflow` (see [Tool Cache Management](#tool-cache-management) below). An empty cache emits a warning and falls back for every step.

Stateful mode exit codes: 0 = all steps converted cleanly, 1 = any step fell back to schema-free (typically a missing tool).

## Roundtrip Validation

`gxwf roundtrip` converts a native workflow to format2 and back via stateful conversion, then diffs the original and reimported `tool_state` step-by-step. Use this to verify that a workflow survives a round-trip through format2 without silent state corruption.

```bash
# Single file
gxwf roundtrip my-workflow.ga --cache-dir ~/.cache/galaxy-tools

# Batch (native workflows only — format2 files are skipped)
gxwf roundtrip-tree ./workflows/ --cache-dir ~/.cache/galaxy-tools

# Structured JSON report
gxwf roundtrip my-workflow.ga --json
```

### Diff Classification

Per-step diffs are classified as **benign** or **real**:

- **Benign** (expected artifacts of stateful conversion):
  - `bookkeeping_stripped` — stale keys (`__page__`, `__rerun_remap_job_id__`, `chromInfo`, ...) removed
  - `multi_select_normalized` — comma-delimited string ↔ list representation change
  - `all_null_section_omitted` — section with all-null leaves dropped
  - `empty_container_omitted` — empty repeat placeholder dropped
  - `connection_only_section_omitted` — section containing only ConnectedValue/RuntimeValue markers moved to the `in` block
- **Real** — value changes, missing keys, type mismatches not covered by the type-equivalence rules

Type-equivalent values (`"5"` ↔ `5`, `"true"` ↔ `true`, `"null"` ↔ `null`) are treated as equal and emit no diff. (The `BenignArtifactKind` TS union also declares a `type_coercion` member for completeness, but it is never emitted in practice — equivalent scalars produce no diff at all rather than a benign one.)

Roundtrip requires a populated tool cache — an empty cache emits a warning and every step falls back, yielding exit code 2.

### Exit Codes

| Code | Meaning |
|---|---|
| 0 | Clean roundtrip — no diffs of any severity |
| 1 | Benign diffs only (type coercions, stale keys, connection moves) |
| 2 | Real diffs, conversion failures, or a non-native source file |

### Limitations

- Source must be a native (`.ga`) workflow — format2 inputs are rejected.
- Subworkflow steps are listed in the result but their nested `tool_state` is not recursively diffed. Corrupt nested state is not caught.
- No step ID remapping (relies on ID stability across the normalized conversion pipeline).
- No label/annotation/position/tool_version diffing — only `tool_state`.

## Batch Processing

All five operations have tree variants that recursively discover and process workflows under a directory.

```bash
gxwf validate-tree ./workflows/
gxwf lint-tree ./workflows/ --json
gxwf clean-tree ./workflows/ --output-dir ./cleaned/
gxwf convert-tree ./workflows/ --to format2 --output-dir ./converted/
```

### Discovery

Tree commands scan recursively for workflow files:
- **Native**: `.ga`, `.json` (checked for `a_galaxy_workflow` marker)
- **Format2**: `.gxwf.yml`, `.gxwf.yaml`, `.yml`, `.yaml` (checked for `class: GalaxyWorkflow` marker)

Excluded directories: `.git`, `.hg`, `.venv`, `node_modules`, `__pycache__`, `.snakemake`.

### Shared Resources

Tree commands load shared resources once (e.g. tool cache) and reuse them across all files, avoiding repeated filesystem/network I/O.

### Output

- **Text mode** (default): per-file status lines + summary
- **JSON mode** (`--json` or `--report-json`): structured report with per-file results and aggregate summary, suitable for CI integration
- **Markdown report** (`--report-markdown [file]`): human-readable Markdown report (Nunjucks-rendered from bundled templates). Pass a file path to write to disk, or omit the path to write to stdout. Available on `validate-tree`, `lint-tree`, `clean-tree`, and `roundtrip-tree`.
- **HTML report** (`--report-html [file]`): same content as Markdown but rendered as HTML. Available on single-file commands (`validate`, `lint`, `clean`) and all four tree commands.

```bash
# Write an HTML report to a file
gxwf validate-tree ./workflows/ --report-html report.html

# Pipe a Markdown report to stdout
gxwf lint-tree ./workflows/ --report-markdown

# JSON + HTML together
gxwf roundtrip-tree ./workflows/ --json --report-html report.html
```

### Exit Codes

Tree commands use the worst exit code across all files. If any workflow fails, the overall exit code reflects that failure.

## JSON Output Formats

All commands support `--json` for machine-readable output. The report shapes use snake_case field names to match Galaxy's Python report models.

### Validation report (`gxwf validate --json`)

```json
{
  "workflow": "/abs/path/my-workflow.ga",
  "valid": true,
  "steps": [
    {
      "step_id": 0,
      "tool_id": "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc",
      "status": "ok",
      "errors": [],
      "skip": false,
      "skip_replacement_params": false
    }
  ],
  "structure_errors": [],
  "encoding_errors": []
}
```

`structure_errors` — schema decode failures (unknown keys, wrong types at the workflow envelope level). Populated when `--strict-structure` is on.

`encoding_errors` — legacy encoding signals (JSON-string `tool_state`, wrong format2 field). Populated when `--strict-encoding` is on.

Step `status` values: `"ok"` | `"failed"` | `"skipped"` | `"tool_not_found"`.

### Lint report (`gxwf lint --json`)

```json
{
  "workflow": "/abs/path/my-workflow.ga",
  "lint_errors": 0,
  "lint_warnings": 1,
  "steps": [...],
  "structure_errors": [],
  "encoding_errors": []
}
```

### Tree reports

Tree commands add a top-level `workflows` array (each entry has `relative_path`, `format`, and `category`) and a `summary` object with `ok`, `fail`, and `skip` counts.

```json
{
  "directory": "/abs/path/workflows",
  "workflows": [
    { "relative_path": "category/my-workflow.ga", "format": "native", "category": "category" }
  ],
  "summary": { "ok": 12, "fail": 1, "skip": 0 }
}
```

## Tool Cache Management

Tool state validation and lint require a populated tool cache. Two approaches:

### Per-workflow Population

```bash
# Cache all tools referenced in a specific workflow
galaxy-tool-cache populate-workflow my-workflow.ga
```

### Manual Population

```bash
# Cache individual tools
galaxy-tool-cache add toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc --version 0.74+galaxy0
```

### Tool Shed Discovery

When you don't already have a tool id in hand, `gxwf` exposes JSON-first
discovery against [`toolshed.g2.bx.psu.edu`](https://toolshed.g2.bx.psu.edu)
that feeds straight into `galaxy-tool-cache add`. See [CLI reference →
Tool Shed discovery commands](../packages/cli#tool-shed-discovery-commands)
for full option tables.

```bash
# 1. Find candidate tools by free-text query
gxwf tool-search fastqc --json

# 2. Resolve the picked tool to an installable version
gxwf tool-versions devteam/fastqc/fastqc --latest

# 3. Cache the ParsedTool for validation / lint / convert --stateful
galaxy-tool-cache add toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc --version 0.74+galaxy0

# 4. (Optional) Resolve to a specific changeset for reproducible workflow pinning
gxwf tool-revisions devteam/fastqc/fastqc --tool-version 0.74+galaxy0 --latest --json
```

### Schema Export

Export the structural workflow JSON Schema for use with external validators:

```bash
galaxy-tool-cache structural-schema --output galaxy-workflow-schema.json
galaxy-tool-cache structural-schema --format native --output native-schema.json
```

## Programmatic Usage

All CLI commands are also available as library functions:

```typescript
import { ToolInfoService } from "@galaxy-tool-util/core";
import {
  createFieldModel,
  normalizedNative,
  NormalizedNativeWorkflowSchema,
} from "@galaxy-tool-util/schema";
import * as S from "effect/Schema";

// 1. Parse and normalize the workflow
const raw = JSON.parse(workflowJson);
const workflow = S.decodeUnknownSync(NormalizedNativeWorkflowSchema)(raw);

// 2. For each tool step, validate tool_state
const service = new ToolInfoService();

for (const step of Object.values(workflow.steps)) {
  if (!step.tool_id) continue;

  const tool = await service.getToolInfo(step.tool_id, step.tool_version);
  if (!tool) continue;

  const schema = createFieldModel(
    { parameters: tool.inputs },
    "workflow_step"
  );
  if (!schema) continue;

  const result = S.decodeUnknownEither(schema)(step.tool_state);
  // Handle validation result...
}
```

### Tree Orchestrator

For batch operations, use the tree orchestrator directly:

```typescript
import { collectTree, summarizeOutcomes, skipWorkflow } from "@galaxy-tool-util/cli";

const result = await collectTree("./workflows/", (info, data) => {
  if (data.some_condition) skipWorkflow("not applicable");
  return processWorkflow(info, data);
});

const summary = summarizeOutcomes(result.outcomes, (r) => r.hasFailed);
console.log(`${summary.ok} OK, ${summary.fail} failed`);
```

## Python Parity

Mapping between Python CLI commands and their TypeScript equivalents:

| Python | TypeScript | Status |
|---|---|---|
| `gxwf-lint` | `gxwf lint --skip-state-validation` | Done |
| `gxwf-to-format2` | `gxwf convert --to format2` | Done |
| `gxwf-to-native` | `gxwf convert --to native` | Done |
| `gxwf-state-validate` | `gxwf validate` | Done |
| `gxwf-state-validate-tree` | `gxwf validate-tree` | Done |
| `gxwf-state-clean` | `gxwf clean` | Done |
| `gxwf-state-clean-tree` | `gxwf clean-tree` | Done |
| `gxwf-lint-stateful` | `gxwf lint` | Done |
| `gxwf-lint-stateful-tree` | `gxwf lint-tree` | Done |
| `gxwf-to-format2-stateful` | `gxwf convert --to format2 --stateful` | Done |
| `gxwf-to-native-stateful` | `gxwf convert --to native --stateful` | Done |
| `gxwf-to-format2-stateful-tree` | `gxwf convert-tree --to format2 --stateful` | Done |
| `gxwf-to-native-stateful-tree` | `gxwf convert-tree --to native --stateful` | Done |
| `gxwf-roundtrip-validate` | `gxwf roundtrip` | Done |
| `gxwf-roundtrip-validate-tree` | `gxwf roundtrip-tree` | Done |
| `galaxy-tool-cache populate-workflow` | `galaxy-tool-cache populate-workflow` | Done |
| `galaxy-tool-cache structural-schema` | `galaxy-tool-cache structural-schema` | Done |
| `galaxy-tool-cache add-local` | — | Out of scope (no local XML parsing) |
| `gxwf-viz` | — | Out of scope |
| `gxwf-abstract-export` | — | Out of scope |

## Common Validation Errors

| Error | Cause |
|---|---|
| `Unknown parameter type` | Tool uses a parameter type not yet registered in the schema package |
| `Tool not found` | Tool not in cache and not fetchable from configured sources |
| `Missing required property` | A required parameter is absent from tool_state |
| `Expected string, got number` | Parameter value type mismatch for the chosen [state representation](glossary#state-representations) |
| `No parameter definition matching connection key` | A connection references a parameter that doesn't exist in the tool definition |
