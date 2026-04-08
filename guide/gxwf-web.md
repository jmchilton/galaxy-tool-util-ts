# gxwf-web Server

`gxwf-web` is a local HTTP server that exposes Galaxy workflow operations and a Jupyter-compatible file contents API. Any HTTP client can use it — browser-based editors, language servers, CI scripts, or custom tooling.

```
HTTP client
     │  (localhost)
     ▼
gxwf-web server
     │
     ├── /api/contents/*          — file CRUD + checkpoints
     ├── /api/schemas/structural  — structural JSON Schema export
     ├── /workflows               — workflow index
     └── /workflows/{path}/{op}   — validate / lint / clean / to-format2 / to-native / roundtrip
```

## Installation

```bash
npm install -g @galaxy-tool-util/gxwf-web
# or with pnpm / yarn
pnpm add -g @galaxy-tool-util/gxwf-web
```

The published package includes the pre-built gxwf-ui frontend. Once installed, `gxwf-web <dir>` starts both the API server and serves the Vue UI at the root — no separate frontend install needed.

## Starting the Server

```bash
# Serve the current directory on localhost:8000
# UI available at http://localhost:8000/
gxwf-web .

# Custom host and port
gxwf-web ./workflows --host 0.0.0.0 --port 9000

# Use a pre-populated tool cache directory
gxwf-web ./workflows --cache-dir ~/.cache/galaxy-tools
```

### CLI Flags

| Flag | Default | Description |
|---|---|---|
| `<directory>` | (required) | Root directory of workflow files |
| `--host` | `127.0.0.1` | Bind address |
| `--port` | `8000` | Bind port |
| `--cache-dir <path>` | system default | Tool cache directory |
| `--config <path>` | — | Path to YAML configuration file (see below) |
| `--output-schema` | — | Print the OpenAPI schema to stdout and exit |

### YAML Configuration

For persistent tool source configuration, pass a YAML config file:

```yaml
# gxwf.yml
cache_dir: ~/.cache/galaxy-tools
sources:
  - type: toolshed
    url: https://toolshed.g2.bx.psu.edu
  - type: galaxy
    url: https://usegalaxy.org
```

```bash
gxwf-web ./workflows --config gxwf.yml
```

CLI flags take precedence over config file values (e.g. `--cache-dir` overrides `cache_dir` in the file).

## Workflow Operations API

All workflow operations are `GET /workflows/{workflow_path}/{op}`.

`workflow_path` is the relative path from the server's configured directory (e.g. `subdir/my-workflow.ga`).

### `validate`

Validates workflow structure and tool state.

```
GET /workflows/{workflow_path}/validate
  ?strict=true          # enable structure + encoding strict checks (not strictState — see note)
  ?connections=true     # validate step connections (not yet implemented, accepted for parity)
  ?mode=effect          # validation backend: effect (default) or json-schema
  ?allow=tool_id        # tool IDs whose stale keys are allowed (future work)
  ?deny=tool_id         # tool IDs whose stale keys are denied (future work)
```

> **Note:** The HTTP API's `strict` parameter enables `strictStructure` and `strictEncoding` but does **not** enable `strictState`. This differs from the CLI's `--strict` flag, which enables all three. Steps with missing tools are always silently skipped in the HTTP API regardless of `strict`.

Response: `SingleValidationReport`

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

### `lint`

Runs structural checks, best-practice checks, and tool state validation.

```
GET /workflows/{workflow_path}/lint
  ?strict=true    # enables strictStructure + strictEncoding (not strictState)
  ?allow=tool_id
  ?deny=tool_id
```

Response: `SingleLintReport` — same shape as validate plus `lint_errors` and `lint_warnings` counts.

### `clean`

Reports stale keys that would be removed by `gxwf clean`.

```
GET /workflows/{workflow_path}/clean
  ?preserve=key         # keys to preserve (future work)
  ?strip=key            # keys to always strip (future work)
```

Response: `SingleCleanReport`

### `to-format2` / `to-native`

Stateful format conversion.

- `to-format2` requires a native (`.ga`) workflow
- `to-native` requires a format2 (`.gxwf.yml`) workflow

```
GET /workflows/{workflow_path}/to-format2
GET /workflows/{workflow_path}/to-native
```

### `roundtrip`

Roundtrip-validates a native workflow (native → format2 → native, diffs tool_state per step).

```
GET /workflows/{workflow_path}/roundtrip
```

Response: `SingleRoundTripReport`

## Workflow Index

```
GET /workflows          — list all discovered workflows
POST /workflows/refresh — re-scan directory for new/removed workflows
```

Response: `WorkflowIndex`

```json
{
  "directory": "/abs/path",
  "workflows": [
    {
      "relative_path": "category/my-workflow.ga",
      "format": "native",
      "category": "category"
    }
  ]
}
```

Workflow discovery runs on startup and updates automatically when files are added or removed via the contents API. Use `POST /workflows/refresh` if you modify files outside the API.

## Contents API

The contents API mirrors the [Jupyter Contents API](https://jupyter-server.readthedocs.io/en/latest/developers/contents.html), making `gxwf-web` compatible with Jupyter-based editor frameworks.

Base path: `/api/contents`

### Reading files and directories

```
GET /api/contents                     — list root directory
GET /api/contents/{path}              — read file or list directory
  ?content=0                          — omit file content (metadata only)
  ?format=text|base64                 — encoding for file content
```

### Writing files

```
PUT /api/contents/{path}
```

Request body: `ContentsModel` (JSON). Include `If-Unmodified-Since` header for optimistic concurrency.

### Creating untitled files

```
POST /api/contents                    — create untitled file in root
POST /api/contents/{dir}             — create untitled file in directory
```

Request body: `{ "type": "file", "ext": ".ga" }`

### Renaming / moving

```
PATCH /api/contents/{path}
```

Request body: `{ "path": "new/relative/path" }`

### Deleting

```
DELETE /api/contents/{path}
```

Returns 204 No Content. Deleting the root returns 403.

### Checkpoints

```
GET    /api/contents/{path}/checkpoints      — list checkpoints
POST   /api/contents/{path}/checkpoints      — create checkpoint
POST   /api/contents/{path}/checkpoints/{id} — restore checkpoint
DELETE /api/contents/{path}/checkpoints/{id} — delete checkpoint
```

Checkpoints are stored in a `.checkpoints/` directory alongside the workflow files.

## Structural Schema

Get the JSON Schema for Galaxy workflow structure (for external validators):

```
GET /api/schemas/structural
  ?format=format2    # (default)
  ?format=native
```

Or export via CLI without starting the server:

```bash
gxwf-web --output-schema
```

## CORS

The server sends permissive CORS headers (`Access-Control-Allow-Origin: *`) on all responses, suitable for browser-based editors connecting to a local dev server.
