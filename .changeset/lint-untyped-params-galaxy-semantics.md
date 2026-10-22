---
"@galaxy-tool-util/schema": patch
---

Untyped parameter lint follows Galaxy's `${name}` semantics: renames referencing a declared parameter input label no longer warn, and each warning names the reference, the action and output, and the fix. Mirrors gxformat2.
