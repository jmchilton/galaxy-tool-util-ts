# @galaxy-tool-util/tool-cache-proxy

`galaxy-tool-proxy` — HTTP proxy server that caches and serves Galaxy tool schemas. Mirrors a subset of the ToolShed API with CORS support, intended as a sidecar for the Galaxy workflow editor or other clients that need tool metadata.

## Usage

```bash
# Run with defaults (localhost:8080)
galaxy-tool-proxy

# Run with a config file
galaxy-tool-proxy --config proxy-config.yml

# Override port
galaxy-tool-proxy --port 3000
```

## Configuration

YAML config file defining tool sources and server options:

```yaml
galaxy.workflows.toolSources:
  - type: toolshed
    url: https://toolshed.g2.bx.psu.edu
    enabled: true
  - type: galaxy
    url: https://usegalaxy.org
    enabled: true

galaxy.workflows.toolCache:
  directory: /tmp/tool-cache

port: 8080
host: 127.0.0.1
```

### Config Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `galaxy.workflows.toolSources` | `ToolSource[]` | `[]` | Ordered list of tool sources |
| `galaxy.workflows.toolSources[].type` | `"toolshed" \| "galaxy"` | — | Source type |
| `galaxy.workflows.toolSources[].url` | `string` | — | Source URL |
| `galaxy.workflows.toolSources[].enabled` | `boolean` | `true` | Enable/disable source |
| `galaxy.workflows.toolCache.directory` | `string` | `~/.galaxy/tool_info_cache` | Cache directory |
| `port` | `number` | `8080` | Server port |
| `host` | `string` | `127.0.0.1` | Bind address |

## API Routes

### `GET /api/tools`

List all cached tools.

**Response:** Array of cache index entries.

### `GET /api/tools/:trs_id/versions/:version`

Get parsed metadata for a specific tool. Fetches from configured sources if not cached.

**Response:** `ParsedTool` JSON object.

### `GET /api/tools/:trs_id/versions/:version/schema`

Get a JSON Schema for a tool's parameters.

**Query parameters:**
- `representation` — State representation (default: `workflow_step`). See [Schema docs](packages/schema.md) for available representations.

**Response:** JSON Schema object.

### `DELETE /api/tools/cache`

Clear the tool cache.

**Query parameters:**
- `prefix` — Only clear tools matching this prefix.

**Response:** `{ "status": "cleared" }`

## CORS

All responses include permissive CORS headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

## Programmatic Usage

```typescript
import { loadConfig, createProxyContext, createProxyServer } from "@galaxy-tool-util/tool-cache-proxy";

const config = await loadConfig("proxy-config.yml");
const ctx = createProxyContext(config);
const server = createProxyServer(ctx);

server.listen(config.port, config.host, () => {
  console.log(`Listening on ${config.host}:${config.port}`);
});
```
