---
"@galaxy-tool-util/schema": minor
---

Add `expandToolStateDefaults(toolInputs, currentState)` — port of Galaxy's `fill_static_defaults`. Fills scalar defaults for absent keys, recurses into conditionals (honoring user's active `test_value`), pads repeats to `min`, creates+fills absent sections. Does not validate; does not pre-seed data / data_collection (non-optional) / baseurl / color / directory_uri / group_tag / rules / data_column inputs. Walker gains a `repeatMinPad` option to support the expand-defaults repeat semantics.
