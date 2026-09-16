# @galaxy-tool-util/core

[Tool cache](glossary#tool-cache), [ToolShed](https://toolshed.g2.bx.psu.edu)/[Galaxy](https://galaxyproject.org) API client, and [ParsedTool](glossary#parsed-tool) model. Handles fetching tool metadata from remote sources and caching it locally for offline use.

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

[Effect Schema](https://effect.website/docs/schema/introduction) model representing parsed tool metadata:

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

Fetch a tool from a ToolShed instance via [TRS](https://ga4gh.github.io/tool-registry-service-schemas/) API.

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

## Wrapper source

`ToolInfoService.fetchToolSource(toolId, toolVersion)` lazily fetches and caches a
serialized wrapper independently of parsed tool metadata. It returns
`{ contents, language, macrosExpanded }`, or `null` when every provider reports
the source missing. Other upstream failures are surfaced after trying the
configured sources in order.

Tool Shed sources use `/api/tools/{trs_id}/versions/{version}/tool_source`.
Galaxy sources use `/api/tools/{id}/raw_tool_source?tool_version={version}`;
source display must be allowed by that Galaxy instance. XML is the expanded
document returned by the provider, selected by wrapper version. Exact repository
changesets, original wrapper files, and separate macro files are outside this API.

Filesystem storage keeps `<key>.source` alongside parsed `<key>.json`, with format
metadata in `<key>.source.json`. IndexedDB stores the same document separately
from parsed metadata. Refetch and cache deletion invalidate both representations.
Custom storage backends can implement the optional `loadSource` and `saveSource`
methods; otherwise source caching is limited to memory.

Both HTTP servers expose `GET /api/tools/{tool_id}/versions/{tool_version}/tool_source`
as `text/plain; charset=utf-8`, without JSON quoting. The `language` and
`X-Tool-Source-Macros-Expanded` headers describe the cached document. Missing source
returns 404; other upstream failures return 502.

Inspector entries may include `requestVersion` when their cache key uses a sentinel
such as `_default_` while `toolVersion` shows a concrete wrapper version. Use
`requestVersion ?? toolVersion` for source/model reads and refetch requests so they
address the same cache entry. Stock tool IDs remain unchanged; the shared inspector
also normalizes the fabricated stock IDs found in older cache indexes.
