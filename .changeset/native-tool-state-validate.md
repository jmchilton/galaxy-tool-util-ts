---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
"@galaxy-tool-util/gxwf-web": minor
---

format2 conversion + validate: honor the `state` vs `tool_state` contract.

**Converter:** `toFormat2Stateful` now writes a successful schema-aware conversion to the format2 `state` field (with connections/runtime lifted into `in:`), and only falls back to raw `tool_state` when conversion is unavailable or fails — matching gxformat2's `state_encode_to_format2` contract. Previously the clean state was incorrectly written to `tool_state`, leaving the `state` field unused even though the native-side reader already expects it.

**Validate:** `gxwf validate` now picks the validator by state shape, not workflow format. A schema-aware `state` block validates against the format2 model as before; a verbatim native `tool_state` block (what the state-unaware conversion copies in, with inline `ConnectedValue`/`RuntimeValue` markers) validates against the native model — the same one native `.ga` steps use. This fixes the false-positive `fail` on inline `RuntimeValue`, which the native model accepts, and gives real validation coverage instead of a skip. Replacement-parameter (`${...}`) tool_state still skips as `skip_replacement_params`.

Together: a successful stateful conversion produces a validatable `state` block; an unaware/failed conversion produces a `tool_state` block that validate now checks via the native path. Closes #113.

**Mutual exclusion:** `validate_format2` (and its strict variant) now reject a step that specifies both `state` and `tool_state` — the schema has always documented "only one or the other should be specified", but the rule was previously unenforced. The check uses non-empty semantics, so an empty `state: {}` left by conversion does not falsely conflict with a populated `tool_state`. Mirrors the matching enforcement added upstream in gxformat2's semantic validators.
