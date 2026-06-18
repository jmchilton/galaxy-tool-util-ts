---
"@galaxy-tool-util/schema": minor
---

feat(schema): export `normalizeStepIn` / `normalizeStepOut` step shorthand expanders

The per-step `in:` / `out:` shorthand expansion logic used internally by
`normalizedFormat2` is now public. Both are pure and value-based (no AST
awareness), so consumers holding a raw gxformat2 step dict — e.g. the
VS Code language server walking a parsed document — can reuse the canonical
shorthand rules instead of re-deriving them.

`normalizeStepIn` covers every form: list-of-strings, list-of-objects,
map-to-string, map-to-object, and the map-to-list (multi-source) shorthand.
Pairs with the existing `nativeConnectionsFromFormat2In` to build a native
connections map from a raw step's `in:` block.
