# @galaxy-tool-util/search

Tool discovery for Galaxy: Tool Shed search client, result normalization, and ranking helpers. Built on `@galaxy-tool-util/core` (`ParsedTool`, `ToolInfoService`, cache). Browser-safe.

## Status

`0.1.x` — wire types and a normalizer for Tool Shed `/api/tools?q=` responses. HTTP client, `ToolSearchService`, and ranking land in subsequent minor releases.

## `normalizeToolSearchResults`

Validates and normalizes a raw Tool Shed search payload. Coerces stringified pagination numbers (`total_results`, `page`, `page_size`) into JS numbers and shape-checks every hit. Throws a descriptive `Error` identifying the offending field on malformed input.

```typescript
import { normalizeToolSearchResults } from "@galaxy-tool-util/search";

const raw: unknown = await fetch(
  "https://toolshed.g2.bx.psu.edu/api/tools?q=fastqc",
).then((r) => r.json());

const results = normalizeToolSearchResults(raw);
// {
//   total_results: 32,
//   page: 1,
//   page_size: 10,
//   hostname: "https://toolshed.g2.bx.psu.edu",
//   hits: [
//     {
//       tool: { id, name, description, repo_name, repo_owner_username, version?, changeset_revision? },
//       matched_terms: { name: "fastqc", help: "fastqc" },
//       score: 47.96,
//     },
//     ...
//   ]
// }
```

## Wire types

`ToolSearchHit` and `SearchResults<A>` mirror the Tool Shed JSON one-for-one (snake_case). They are plain TypeScript interfaces — no Effect Schema — because these payloads are one-way deserialized from a trusted peer and immediately flattened into a downstream camelCase model. Effect Schema's bidirectional codec / diagnostics tree / composable transforms do not apply.

`tool.version` and `tool.changeset_revision` are optional. Current Tool Shed responses omit them; the normalizer preserves them when present.

## What lives where

| Concern | Package |
|---|---|
| Tool Shed wire types + `normalizeToolSearchResults` | **`@galaxy-tool-util/search`** |
| HTTP client (`searchTools`, TRS versions) | `@galaxy-tool-util/search` (later release) |
| `ToolSearchService` (multi-source fan-out, dedup, enrichment) | `@galaxy-tool-util/search` (later release) |
| Ranking / fuzzy re-ranking | `@galaxy-tool-util/search` (later release) |
| Cache + `ParsedTool` + `ToolInfoService` | `@galaxy-tool-util/core` |
| Parameter types + state representations | `@galaxy-tool-util/schema` |
