---
"@galaxy-tool-util/schema": patch
---

Add optional `type?: WorkflowDataType` to `WorkflowOutput`. Extractors leave it unset; downstream consumers (e.g. the VS Code plugin's AST extractor) populate it when the information is available.
