---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

Add `validateUserToolSource` and `gxwf validate-tool-source[-tree]` for validating user-defined Galaxy tool source YAML (`class: GalaxyUserTool` / `GalaxyTool`) against the Galaxy `DynamicToolSources` JSON Schema plus the semantic checks from galaxyproject/galaxy#22615 (input refs in `shell_command`/`configfiles`, output discovery requirements, citation DOI/BibTeX shape, blank required fields). Schema is synced via `make sync-user-tool-source-schema`; sha256 verified by `make check`.
