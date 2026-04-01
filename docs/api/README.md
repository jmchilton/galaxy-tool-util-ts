# API Reference

## @galaxy-tool-util/schema

Core schema generation and workflow types.

| Export | Description |
|---|---|
| `createFieldModel(bundle, stateRep)` | Build Effect Schema for tool parameters at a state representation |
| `STATE_REPRESENTATIONS` | Array of all valid state representation names |
| `registeredParameterTypes()` | Set of all supported parameter types |
| `isParameterTypeRegistered(type)` | Check if a parameter type has a generator |
| `collectParameterTypes(bundle)` | Extract parameter types from a tool bundle |
| `GalaxyWorkflowSchema` | Union schema for any Galaxy workflow format |
| `NormalizedFormat2WorkflowSchema` | Schema for normalized format2 workflows |
| `NormalizedNativeWorkflowSchema` | Schema for normalized native workflows |
| `normalizedFormat2(wf)` | Normalize a raw format2 workflow |
| `normalizedNative(wf)` | Normalize a raw native workflow |
| `expandedFormat2(wf, opts)` | Async — normalize + expand subworkflow refs |
| `expandedNative(wf, opts)` | Async — normalize + expand subworkflow refs |
| `isTrsUrl(url)` | Check if a string is a TRS URL |

## @galaxy-tool-util/core

Caching, fetching, and tool metadata models.

| Export | Description |
|---|---|
| `ToolInfoService` | High-level service: fetch + cache + multi-source fallback |
| `ToolCache` | Low-level cache with memory + filesystem layers |
| `CacheIndex` | Cache metadata index |
| `ParsedTool` | Effect Schema for parsed tool metadata |
| `fetchFromToolShed(url, trsId, ver)` | Fetch tool from ToolShed TRS API |
| `fetchFromGalaxy(url, toolId, ver)` | Fetch tool from Galaxy API |
| `parseToolshedToolId(id)` | Parse full tool ID into coordinates |
| `cacheKey(url, trsId, ver)` | Compute deterministic cache key |
| `DEFAULT_CACHE_DIR` | `~/.galaxy/tool_info_cache` |
| `DEFAULT_TOOLSHED_URL` | `https://toolshed.g2.bx.psu.edu` |

## @galaxy-tool-util/cli

CLI command implementations (also usable programmatically).

| Export | Description |
|---|---|
| `runAdd(toolId, opts)` | Fetch and cache a tool |
| `runList(opts)` | List cached tools |
| `runInfo(toolId, opts)` | Show tool metadata |
| `runClear(prefix?, opts)` | Clear cache |
| `runSchema(toolId, opts)` | Export JSON Schema |
| `runValidateWorkflow(file, opts)` | Validate a workflow file |

## @galaxy-tool-util/server

HTTP proxy server components.

| Export | Description |
|---|---|
| `loadConfig(path)` | Load YAML config file |
| `defaultConfig()` | Get default server config |
| `ServerConfig` | Effect Schema for server configuration |
| `createProxyContext(config)` | Create proxy context with ToolInfoService |
| `createProxyServer(ctx)` | Create HTTP server |
| `createRequestHandler(ctx)` | Create request handler function |

## Full TypeDoc Reference

[View generated TypeDoc API documentation →](typedoc/index.html)
