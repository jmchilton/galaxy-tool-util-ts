# Proxy Server Setup

## Use Case

The Galaxy workflow editor needs tool schemas to validate step parameters, but querying the ToolShed directly from the browser has CORS and performance issues. `galaxy-tool-proxy` acts as a local sidecar that:

- Fetches tool metadata from ToolShed/Galaxy on demand
- Caches results locally
- Serves JSON Schemas over a simple REST API with CORS enabled

## Quick Start

```bash
npm install -g @galaxy-tool-util/tool-cache-proxy
galaxy-tool-proxy
# Listening on 127.0.0.1:8080
```

## Configuration

Create a YAML config file:

```yaml
# proxy-config.yml
galaxy.workflows.toolSources:
  - type: toolshed
    url: https://toolshed.g2.bx.psu.edu
    enabled: true
  - type: galaxy
    url: https://usegalaxy.org
    enabled: false

galaxy.workflows.toolCache:
  directory: /tmp/tool-cache

port: 8080
host: 127.0.0.1
```

Run with the config:

```bash
galaxy-tool-proxy --config proxy-config.yml
```

## Multiple Tool Sources

Sources are tried in order. If the first source fails (network error, tool not found), the next is tried. This lets you fall back from ToolShed to a Galaxy instance:

```yaml
galaxy.workflows.toolSources:
  - type: toolshed
    url: https://toolshed.g2.bx.psu.edu
  - type: galaxy
    url: http://localhost:8080   # Local Galaxy dev server
```

## Example Requests

```bash
# List cached tools
curl http://localhost:8080/api/tools

# Get tool metadata
curl http://localhost:8080/api/tools/fastqc/versions/0.74+galaxy0

# Get JSON Schema for tool parameters
curl http://localhost:8080/api/tools/fastqc/versions/0.74+galaxy0/schema
curl http://localhost:8080/api/tools/fastqc/versions/0.74+galaxy0/schema?representation=workflow_step_linked

# Clear cache
curl -X DELETE http://localhost:8080/api/tools/cache
```
