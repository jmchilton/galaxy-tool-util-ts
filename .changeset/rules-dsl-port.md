---
"@galaxy-tool-util/workflow-graph": minor
"@galaxy-tool-util/connection-validation": patch
---

Port Galaxy's rule builder DSL (`RuleSet`) to `workflow-graph`, checked against Galaxy's synced `rules_dsl_spec.yml`. Connection validation now types `collection_type_from_rules` outputs (e.g. `__APPLY_RULES__`) from the step's rules mapping, as Galaxy does, instead of skipping their edges (#204).
