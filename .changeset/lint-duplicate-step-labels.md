---
"@galaxy-tool-util/schema": minor
---

Lint duplicate step labels as errors (new `StepLabelNotUnique` rule in the
`structural` profile), porting gxformat2's check. Galaxy refuses to import a
workflow whose steps (inputs included) share a label; subworkflows have their
own label namespace. Format2 lint checks the native labels that conversion
assigns (shared `nativeInputLabel` / `nativeStepLabel` helpers), so it flags
exactly what Galaxy will see.
