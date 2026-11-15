---
"@galaxy-tool-util/schema": minor
---

Add the workflow-level `is_based_on` list (schema.org `isBasedOn` upstream works, each a `BasedOnWork` with `class`, `name`, `url`, `version`, `identifier`, `license`, nested `creator`, ...) to the Format2, draft and native workflow schemas, synced from gxformat2. `normalizedFormat2`, `normalizedNative`, `toNative` and `toFormat2` carry it through; the converters drop an empty list. `normalizedNative` now also keeps the workflow-level `creator`, so `toFormat2` no longer loses it. The schema sync also brings gxformat2's unified Creator types and strict rejection of unknown keys on Format2 workflow outputs.
