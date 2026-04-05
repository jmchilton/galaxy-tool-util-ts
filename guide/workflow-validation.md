# Workflow Validation

End-to-end guide for validating [Galaxy](https://galaxyproject.org) workflow files using `galaxy-tool-util`.

> For a broader overview of all workflow operations (cleaning, linting, conversion, batch processing), see [Workflow Operations](guide/workflow-operations.md).

## Overview

Workflow validation has two layers:

1. **Structure validation** — does the workflow conform to the Galaxy workflow schema ([Format2](glossary#format2) or native)?
2. **Tool state validation** — does each step's `tool_state` match the expected parameter schema for that tool?

## CLI Usage

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

## Programmatic Usage

```typescript
import { ToolInfoService } from "@galaxy-tool-util/core";
import {
  createFieldModel,
  normalizedNative,
  NormalizedNativeWorkflowSchema,
} from "@galaxy-tool-util/schema";
import * as S from "effect/Schema";
import * as JSONSchema from "effect/JSONSchema";

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

## Format2 Workflows

Format2 workflows (`.gxwf.yml`) use a YAML-based format with implicit normalization:

```typescript
import {
  NormalizedFormat2WorkflowSchema,
  expandedFormat2,
} from "@galaxy-tool-util/schema";

// Parse, normalize, and expand subworkflow references
const expanded = await expandedFormat2(rawYaml, {
  resolver: async (url) => {
    const response = await fetch(url);
    return response.text();
  },
});
```

## Common Validation Errors

| Error | Cause |
|---|---|
| `Unknown parameter type` | Tool uses a parameter type not yet registered in the schema package |
| `Tool not found` | Tool not in cache and not fetchable from configured sources |
| `Missing required property` | A required parameter is absent from tool_state (common in `job_internal` representation) |
| `Expected string, got number` | Parameter value type mismatch for the chosen [state representation](glossary#state-representations) |
