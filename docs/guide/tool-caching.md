# Tool Caching

> For background on the data flow (fetch → cache → schema generation) and how caching fits the bigger picture, see [How It Works](architecture/overview.md).

## Why Cache?

Tool metadata fetched from the [ToolShed](https://toolshed.g2.bx.psu.edu) or [Galaxy](https://galaxyproject.org) instances is cached locally to:
- Avoid repeated network requests (ToolShed can be slow or rate-limited)
- Enable offline validation and schema generation
- Support CI/CD pipelines without network access

## Cache Layout

Default location: `~/.galaxy/tool_info_cache/`

```
~/.galaxy/tool_info_cache/
  index.json                    # Cache index (tool IDs, versions, sources, timestamps)
  <cache-key>.json              # Parsed tool metadata (one file per tool+version)
```

Cache keys are deterministic — computed from ToolShed URL + TRS tool ID + version. The same tool always maps to the same key.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GALAXY_TOOL_CACHE_DIR` | `~/.galaxy/tool_info_cache` | Override cache directory |
| `GALAXY_TOOLSHED_URL` | `https://toolshed.g2.bx.psu.edu` | Override default ToolShed URL |

## CLI Operations

```bash
# Add a tool to cache
galaxy-tool-cache add toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc --tool-version 0.74+galaxy0

# List cached tools
galaxy-tool-cache list

# Inspect a cached tool
galaxy-tool-cache info toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc --tool-version 0.74+galaxy0

# Clear everything
galaxy-tool-cache clear

# Clear by prefix
galaxy-tool-cache clear fastqc
```

## Stock and Built-in Tools

Galaxy's stock/built-in tools — `Filter1`, `sort1`, `Cut1`, `Show beginning1`, collection
operations like `__APPLY_RULES__`, datatype converters — use **bare tool IDs** (no
`owner/repo/tool` ToolShed path). The ToolShed serves these too, so they resolve with the
bare ID:

```bash
# Stock tools resolve by bare ID against the ToolShed (not just shed-path tools)
galaxy-tool-cache add Filter1 --tool-version 1.1.1
galaxy-tool-cache summarize "Show beginning1" --tool-version 1.0.2
```

Pass `--tool-version` for stock tools while the shed's TRS version-list endpoint is
unavailable; once a stock tool is cached, `summarize`/`info`/`schema` resolve it from the
bare ID. Unversioned built-ins (`__APPLY_RULES__`) are keyed under a `_default_` sentinel.

## Pre-Populating for CI

For CI environments, pre-populate the cache with all tools referenced by your workflows:

```bash
# Cache tools needed by a workflow
galaxy-tool-cache add toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc --tool-version 0.74+galaxy0
galaxy-tool-cache add toolshed.g2.bx.psu.edu/repos/iuc/bcftools_norm/bcftools_norm --tool-version 1.15.1+galaxy3

# Then validate offline
gxwf validate my-workflow.ga
```

Alternatively, commit the cache directory to your repo or use a CI cache action.

## Programmatic Access

```typescript
import { ToolCache, cacheKey, parseToolshedToolId } from "@galaxy-tool-util/core";

const cache = new ToolCache();

// Check if a tool is cached
const coords = cache.resolveToolCoordinates(toolId, version);
const key = cacheKey(coords.toolshedUrl, coords.trsToolId, coords.version);
const tool = await cache.loadCached(key);
```
