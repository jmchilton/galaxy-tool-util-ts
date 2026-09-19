---
"@galaxy-tool-util/cli": minor
---

`gxwf convert` and `gxwf convert-tree` re-encode state schema-aware by default when the tool cache is populated.

Stateful conversion had to be opted into with `--stateful`, so the default invocation copied `tool_state` through verbatim — the output carried an unvalidatable `tool_state` block even on a machine with every tool cached. `gxwf-web` already converted statefully with no flag; the CLI was the outlier.

`--stateful` is now tri-state. Passing nothing re-encodes whenever the cache has something to resolve against and stays schema-free when it doesn't. `--no-stateful` forces verbatim passthrough regardless of the cache, for byte-stable output. `--stateful` still forces it on and keeps warning when the cache is empty.

Conversion output now depends on cache contents where it previously did not. Per-step fallback is unchanged, so an empty cache produces exactly the previous output.
