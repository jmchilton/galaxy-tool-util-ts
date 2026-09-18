---
"@galaxy-tool-util/schema": patch
---

fix(schema): offset list-form step ids by the input count in `normalizedFormat2`

List-form Format2 steps without an explicit `id` were numbered from 0 within
`steps`, while gxformat2 numbers them from the count of `inputs` so a normalized
step id equals the index it takes in native form. A numeric source such as
`0/out_file1` resolved to the first step in TypeScript and to the first input in
Python; both now resolve to the input.
