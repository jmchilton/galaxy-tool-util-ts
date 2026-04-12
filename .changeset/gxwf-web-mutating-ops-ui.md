---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/gxwf-web": minor
"@galaxy-tool-util/gxwf-client": minor
"@galaxy-tool-util/gxwf-report-shell": minor
"@galaxy-tool-util/gxwf-ui": minor
---

Mutating workflow ops + export/convert UI. Schema adds `ExportResult` / `ConvertResult` / `WorkflowSourceFormat`. Report shell adds `ExportReport.vue` and routes `"export"`/`"convert"` report types. UI switches workflow ops to POST, adds dry_run toggle on Clean, Export and Convert tabs with destructive-op confirmation and post-mutation workflow list refresh; Convert navigates back to the dashboard after removing the source. gxwf-client tests exercise POST export/convert and dry_run semantics.
