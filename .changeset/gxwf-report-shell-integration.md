---
"@galaxy-tool-util/gxwf-report-shell": minor
"@galaxy-tool-util/cli": minor
"@galaxy-tool-util/gxwf-ui": patch
---

Integrate gxwf-report-shell with CLI report output (Phases 1–4).

**gxwf-report-shell**: Fix dep direction — switch from `@galaxy-tool-util/gxwf-client` to `@galaxy-tool-util/schema` for all `Single*Report` types. Add four tree-level report components (`TreeValidationReport`, `TreeLintReport`, `TreeCleanReport`, `TreeRoundtripReport`). Extend `ReportShell.vue` and `shell.ts` to dispatch on `validate-tree`, `lint-tree`, `clean-tree`, `roundtrip-tree` types. The same CDN IIFE bundle now renders both single-workflow and tree reports.

**cli**: Add `--report-html [file]` to `validate`, `lint`, and `clean` single-workflow commands. Add CDN-based HTML output (`buildReportHtml` / `writeReportHtml`) to all four tree commands (`validate-tree`, `lint-tree`, `clean-tree`, `roundtrip-tree`). Tree `--report-html` now uses the Vue shell; `--report-markdown` keeps Nunjucks. Rename `SingleReportType` → `ReportType`, `buildSingleReportHtml` → `buildReportHtml`, `writeSingleReportHtml` → `writeReportHtml`. Remove dead Nunjucks HTML path (`getHtmlEnv`, `_macros.html.j2`).

**gxwf-ui**: Switch `useOperation.ts` from `gxwf-client` OpenAPI types to `@galaxy-tool-util/schema` types at API response boundaries.
