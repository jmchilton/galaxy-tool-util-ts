# galaxy-tool-util

TypeScript toolkit for working with [Galaxy](https://galaxyproject.org) tool metadata. Cache tools from the [ToolShed](https://toolshed.g2.bx.psu.edu), generate [Effect](https://effect.website)/[JSON Schemas](https://json-schema.org) for tool parameters, validate workflows, and serve tool schemas over HTTP.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`@galaxy-tool-util/schema`](packages/schema.md) | Effect Schema definitions for Galaxy parameter types and workflow models | `@galaxy-tool-util/schema` |
| [`@galaxy-tool-util/core`](packages/core.md) | Tool cache, ToolShed/Galaxy API client, ParsedTool model | `@galaxy-tool-util/core` |
| [`@galaxy-tool-util/cli`](packages/cli.md) | `galaxy-tool-cache` CLI for caching and inspecting tools | `@galaxy-tool-util/cli` |
| [`@galaxy-tool-util/tool-cache-proxy`](packages/tool-cache-proxy.md) | HTTP proxy server mirroring ToolShed API with YAML config | `@galaxy-tool-util/tool-cache-proxy` |

## Quick Start

```bash
# Install the CLI
npm install -g @galaxy-tool-util/cli

# Cache a tool from the main ToolShed
galaxy-tool-cache add toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc --version 0.74+galaxy0

# Export a JSON Schema for its parameters
galaxy-tool-cache schema toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc --version 0.74+galaxy0

# Validate a Galaxy workflow
gxwf validate my-workflow.ga
```

## Programmatic Usage

```typescript
import { ToolInfoService } from "@galaxy-tool-util/core";
import { createFieldModel } from "@galaxy-tool-util/schema";
import * as JSONSchema from "effect/JSONSchema";

const service = new ToolInfoService();
const tool = await service.getToolInfo(
  "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc",
  "0.74+galaxy0"
);

// Generate an Effect Schema for workflow_step state
const effectSchema = createFieldModel(
  { parameters: tool.inputs },
  "workflow_step"
);

// Convert to JSON Schema
const jsonSchema = JSONSchema.make(effectSchema);
```
