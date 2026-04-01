# @galaxy-tool-util/core

Tool cache, ToolShed/Galaxy API client, and ParsedTool model. Handles fetching tool metadata from remote sources and caching it locally for offline use.

## ToolInfoService

High-level interface that combines caching with remote fetching. Tries sources in order, caches on first success.

```typescript
import { ToolInfoService } from "@galaxy-tool-util/core";

const service = new ToolInfoService({
  sources: [
    { type: "toolshed", url: "https://toolshed.g2.bx.psu.edu" },
    { type: "galaxy", url: "https://usegalaxy.org" },
  ],
  cacheDir: "/tmp/my-cache",
});

const tool = await service.getToolInfo(
  "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc",
  "0.74+galaxy0"
);
// Returns ParsedTool or null
```

### Options

| Option | Type | Description |
|---|---|---|
| `sources` | `ToolSource[]` | Ordered list of sources to try (toolshed or galaxy) |
| `cacheDir` | `string` | Cache directory (default: `~/.galaxy/tool_info_cache`) |
| `defaultToolshedUrl` | `string` | Default ToolShed URL when not specified in tool ID |
| `fetcher` | `typeof fetch` | Custom fetch implementation |

### Adding Tools Manually

```typescript
await service.addTool(toolId, toolVersion, parsedTool, "local", "");
```

## ToolCache

Lower-level cache management with in-memory + filesystem layers.

```typescript
import { ToolCache } from "@galaxy-tool-util/core";

const cache = new ToolCache({ cacheDir: "/tmp/cache" });

// Resolve a tool ID to coordinates
const coords = cache.resolveToolCoordinates(
  "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc",
  "0.74+galaxy0"
);

// Check/load from cache
const hasCached = cache.hasCached(coords.trsToolId, coords.version);
const tool = await cache.loadCached(cacheKey);

// Save to cache
await cache.saveTool(key, parsedTool, toolId, version, "api", sourceUrl);
```

## CacheIndex

Tracks metadata about cached tools (tool_id, version, source, cached_at).

```typescript
const index = cache.index;
await index.load();
const entries = index.listAll(); // CacheIndexEntry[]
```

## ParsedTool

Effect Schema model representing parsed tool metadata:

```typescript
interface ParsedTool {
  id: string;
  version: string;
  name: string;
  description: string;
  inputs: ToolParameterModel[];
  outputs: OutputModel[];
  citations: Citation[];
  license: string | null;
  profile: string | null;
  edam_operations: string[];
  edam_topics: string[];
  xrefs: XrefDict[];
  help: HelpContent | null;
}
```

## Client Functions

### `fetchFromToolShed(url, trsToolId, version, fetcher?)`

Fetch a tool from a ToolShed instance via TRS API.

```typescript
import { fetchFromToolShed } from "@galaxy-tool-util/core";

const tool = await fetchFromToolShed(
  "https://toolshed.g2.bx.psu.edu",
  "fastqc",
  "0.74+galaxy0"
);
```

### `fetchFromGalaxy(url, toolId, version?, fetcher?)`

Fetch a tool from a Galaxy instance via its API.

```typescript
import { fetchFromGalaxy } from "@galaxy-tool-util/core";

const tool = await fetchFromGalaxy(
  "https://usegalaxy.org",
  "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc",
  "0.74+galaxy0"
);
```

## Utility Functions

- `parseToolshedToolId(toolId)` — parse a full ToolShed tool ID into `ToolCoordinates`
- `toolIdFromTrs(toolshedUrl, trsToolId)` — reconstruct full tool ID from TRS components
- `cacheKey(toolshedUrl, trsToolId, version)` — compute cache key for a tool
- `getCacheDir()` — resolve cache directory from env var or default

## Constants

| Constant | Value | Description |
|---|---|---|
| `DEFAULT_CACHE_DIR` | `~/.galaxy/tool_info_cache` | Default cache location |
| `CACHE_DIR_ENV_VAR` | `GALAXY_TOOL_CACHE_DIR` | Env var to override cache dir |
| `DEFAULT_TOOLSHED_URL` | `https://toolshed.g2.bx.psu.edu` | Main Galaxy ToolShed |
| `TOOLSHED_URL_ENV_VAR` | `GALAXY_TOOLSHED_URL` | Env var to override ToolShed URL |
