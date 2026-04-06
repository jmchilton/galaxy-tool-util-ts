# Getting Started

## Prerequisites

- [Node.js](https://nodejs.org) >= 22

Choose the path that matches how you'll use galaxy-tool-util:

- **CLI** — validate workflows, manage a tool cache, and export schemas from the command line
- **Programmatic** — integrate tool metadata fetching, schema generation, and validation into your TypeScript/JavaScript code

## Path 1: CLI Usage

### Install

```bash
npm install -g @galaxy-tool-util/cli
```

This gives you two commands: `galaxy-tool-cache` (tool metadata management) and `gxwf` (workflow operations).

### Cache a Tool

Before you can validate workflows, you need tool metadata cached locally. The CLI fetches it from the [Galaxy ToolShed](https://toolshed.g2.bx.psu.edu) and stores it in `~/.galaxy/tool_info_cache/`:

```bash
galaxy-tool-cache add toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc --version 0.74+galaxy0
```

Or cache all tools referenced in a workflow at once:

```bash
galaxy-tool-cache populate-workflow my-workflow.ga
```

### Validate a Workflow

With tools cached, validate a workflow file's structure and tool state:

```bash
# Full validation (structure + tool state, auto-detects format)
gxwf validate my-workflow.ga

# Format2 workflow
gxwf validate my-workflow.gxwf.yml

# Structure only (no tool cache needed)
gxwf validate my-workflow.ga --no-tool-state
```

For a full walkthrough of validation options, see the [Workflow Validation guide](guide/workflow-validation.md).

### Optional: Export a JSON Schema

Generate a [JSON Schema](https://json-schema.org) describing valid parameter values for a tool at a specific [state representation](glossary#state-representations):

```bash
galaxy-tool-cache schema toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc \
  --version 0.74+galaxy0 \
  --representation workflow_step_linked
```

### Optional: Run the Proxy Server

Serve tool schemas over HTTP — useful as a sidecar for the Galaxy workflow editor:

```bash
npm install -g @galaxy-tool-util/tool-cache-proxy
galaxy-tool-proxy
```

See [Proxy Server Setup](guide/proxy-server.md) for configuration options.

## Path 2: Programmatic Usage

### Install

```bash
npm install @galaxy-tool-util/schema @galaxy-tool-util/core
```

### Fetch Tool Metadata

Use `ToolInfoService` to fetch and cache tool metadata:

```typescript
import { ToolInfoService } from "@galaxy-tool-util/core";

const service = new ToolInfoService();
const tool = await service.getToolInfo(
  "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc",
  "0.74+galaxy0",
);
// tool is a ParsedTool with inputs, outputs, metadata
```

See [`@galaxy-tool-util/core`](packages/core.md) for ToolInfoService options and the ParsedTool model.

### Generate a Schema

Transform a tool's parameter definitions into a typed [Effect Schema](https://effect.website/docs/schema/introduction), parameterized by [state representation](glossary#state-representations):

```typescript
import { createFieldModel } from "@galaxy-tool-util/schema";

const schema = createFieldModel(
  { parameters: tool.inputs },
  "workflow_step",
);
```

### Validate Data

Use the generated schema for runtime validation or export it as JSON Schema:

```typescript
import * as S from "effect/Schema";
import * as JSONSchema from "effect/JSONSchema";

// Runtime validation (returns Either with structured errors)
const result = S.decodeUnknownEither(schema)(toolState);

// Or export to JSON Schema for use with external validators
const jsonSchema = JSONSchema.make(schema);
```

See [`@galaxy-tool-util/schema`](packages/schema.md) for the full API, including workflow parsing and normalization.

## Next Steps

- [How It Works](architecture/overview.md) — understand the conceptual model: data flow, state representations, and why they matter
- [Workflow Operations](guide/workflow-operations.md) — full reference for validate, clean, lint, convert, and roundtrip
- [Configuration reference](guide/configuration.md) for all env vars and options
