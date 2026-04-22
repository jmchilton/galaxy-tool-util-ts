---
"@galaxy-tool-util/core": major
---

TRS tool-version queries, version-optional `getToolInfo`, and `ParsedTool` model relocation.

- New exports: `getTRSToolVersions(toolshedUrl, trsToolId, fetcher?)` and `getLatestTRSToolVersion(toolshedUrl, trsToolId, fetcher?)` (from `./client/trs.ts`), plus the `TRSToolVersion` type. These live in `core` because TRS metadata queries are a cross-cutting concern, not search-specific.
- `ToolInfoService.getToolInfo` now resolves the latest TRS version when the caller omits one, instead of throwing. Still throws only when TRS itself returns no versions for the tool.
- **Breaking:** `ParsedTool`, `HelpContent`, `XrefDict`, and `Citation` Effect Schemas no longer live in `core`. They have moved to `@galaxy-tool-util/schema` (`import { ParsedTool } from "@galaxy-tool-util/schema"`). This reflects the correct separation: `schema` owns data models, `core` owns IO/caching/services. Core now depends on `@galaxy-tool-util/schema`.
