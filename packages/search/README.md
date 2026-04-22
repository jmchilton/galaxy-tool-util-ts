# @galaxy-tool-util/search

Tool discovery for Galaxy: Tool Shed search client, result normalization, and ranking helpers.

Built on `@galaxy-tool-util/core` (`ParsedTool`, `ToolInfoService`, cache). Browser-safe — no Node-only imports in the universal entry.

## Status

`0.1.x` — wire types and a normalizer for Tool Shed `/api/tools?q=` responses. HTTP client, `ToolSearchService`, and ranking land in subsequent minor releases.

## Usage (Stage 1)

```ts
import { normalizeToolSearchResults } from "@galaxy-tool-util/search";

const raw: unknown = await fetch(
  "https://toolshed.g2.bx.psu.edu/api/tools?q=fastqc",
).then((r) => r.json());
const results = normalizeToolSearchResults(raw);
// { totalResults, page, pageSize, hostname, hits: ToolSearchHit[] }
```
