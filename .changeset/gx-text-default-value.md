---
"@galaxy-tool-util/schema": minor
---

Align `TextParameterModel` with Galaxy's `tool_parsing_abstraction` model. **Breaking:** the gx_text default field is renamed `value` → `default_value` (matching Galaxy's `Field(alias="value")` which serializes as `default_value`, and the existing `parameter_models/*.json` goldens). Text `optional` is now inferred faithfully via `text_input_is_optional` — a text param is optional when the empty string passes all its validators (`statically_validates(validators, "")`), instead of the previous value-presence heuristic. So a text param with a default and no validators is now correctly `optional: true`.
