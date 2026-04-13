---
"@galaxy-tool-util/gxwf-web": minor
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": patch
---

Flip workflow operations to write-by-default and add export/convert.

- All 6 `/workflows/{path}/{op}` endpoints now require POST (was GET).
- `clean` writes cleaned content back to disk by default; pass `dry_run=true` to preview without writing.
- New `export` endpoint writes the converted workflow alongside the original (`.ga` ↔ `.gxwf.yml`).
- New `convert` endpoint writes the converted workflow and removes the original.
- Removed `to-format2` and `to-native` endpoints (absorbed into `export`/`convert`).
- Non-dry-run clean/export/convert auto-refresh the workflow index.
- Fix pipe truncation in `gxwf-web --output-schema` for specs larger than the OS pipe buffer.

Schema: promote `serializeWorkflow` and `resolveFormat` from `@galaxy-tool-util/cli` into `@galaxy-tool-util/schema` so the CLI and the web server share one format-aware serializer. New `SerializeWorkflowOptions` adds `indent` (default 2) and `trailingNewline` (default true). YAML output now uses `lineWidth: 0` consistently. CLI re-exports the helpers for backwards compatibility.
