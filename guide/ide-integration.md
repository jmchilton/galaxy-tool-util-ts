# IDE Integration

Guide for building editor extensions and language servers that work with Galaxy workflow files.

Two integration paths are available:

- **HTTP server** (`gxwf-web`) — run a local server and connect via HTTP. Suitable for any editor that can make HTTP requests. See [gxwf-web Server](guide/gxwf-web.md) for the full server and API reference.
- **Programmatic** (`ToolStateValidator`) — validate tool state directly in-process without a server. Suitable for TypeScript language servers and plugins.

## HTTP-based Integration

### Starting the Server

```bash
gxwf-web ./workflows --cache-dir ~/.cache/galaxy-tools
```

See [gxwf-web Server](guide/gxwf-web.md) for all startup flags, YAML config, and API reference.

### TypeScript Client

Use `@galaxy-tool-util/gxwf-client` for a fully-typed HTTP client built on [openapi-fetch](https://openapi-ts.pages.dev/openapi-fetch/):

```bash
npm install @galaxy-tool-util/gxwf-client
```

```typescript
import { createGxwfClient } from "@galaxy-tool-util/gxwf-client";

const client = createGxwfClient("http://localhost:8000");

// List all discovered workflows
const { data: index } = await client.GET("/workflows", {});

// Validate a workflow and surface diagnostics
const { data: report } = await client.GET("/workflows/{workflow_path}/validate", {
  params: {
    path: { workflow_path: "category/my-workflow.ga" },
    query: { strict: true },
  },
});

if (report && !report.valid) {
  for (const step of report.steps) {
    console.log(`Step ${step.step_id}: ${step.errors.join(", ")}`);
  }
}
```

The client is fully typed from the server's OpenAPI schema — all request/response shapes are inferred automatically.

### Workflow Index

Use the workflow index to build file tree views or keep track of which files are workflows:

```typescript
const { data: index } = await client.GET("/workflows", {});
// index.workflows: Array<{ relative_path, format, category }>
```

The index updates automatically when files change via the Contents API. Call `POST /workflows/refresh` if files are modified outside the API.

### File Operations via Contents API

The [Contents API](guide/gxwf-web.md#contents-api) (Jupyter-compatible) lets editors read, write, rename, and delete workflow files, with checkpoint support for undo/restore. This means an editor can:

- Read the current file content before displaying it
- Write back validated/cleaned output after user confirmation
- Create checkpoints before destructive operations
- Restore checkpoints on undo

## Programmatic Integration (No Server)

For TypeScript tools that need tool state validation in-process, use `ToolStateValidator` from `@galaxy-tool-util/schema`. It wraps `ToolInfoService` and produces structured `ToolStateDiagnostic[]` without exposing Effect library internals.

```typescript
import { ToolStateValidator, type ToolStateDiagnostic } from "@galaxy-tool-util/schema";
import { ToolInfoService } from "@galaxy-tool-util/core";

const service = new ToolInfoService({ cacheDir: "~/.cache/galaxy-tools" });
const validator = new ToolStateValidator(service);

// Validate a native (.ga) workflow step's tool_state
const diagnostics: ToolStateDiagnostic[] = await validator.validateNativeStep(
  "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc",
  "0.74+galaxy0",
  step.tool_state,
  step.input_connections,
);

// Validate a format2 step's state dict
const diagnostics2 = await validator.validateFormat2Step(
  "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc",
  "0.74+galaxy0",
  step.state,
);

// Surface diagnostics in the editor
for (const d of diagnostics) {
  console.log(`${d.severity} at ${d.path || "(top level)"}: ${d.message}`);
}
```

### `ToolStateDiagnostic`

```typescript
interface ToolStateDiagnostic {
  /** Dot-separated parameter path, or "" for top-level / unlocated issues. */
  path: string;
  message: string;
  severity: "error" | "warning";
}
```

If the tool is not in the cache, `validate*Step` returns an empty array — the tool is treated as unknown and silently skipped (graceful degradation).
