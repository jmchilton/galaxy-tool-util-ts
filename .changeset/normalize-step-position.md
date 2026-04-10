---
"@galaxy-tool-util/schema": patch
---

Normalize step position to left/top only in cleanWorkflow, porting Python's _strip_position_extras. Adds normalizeStepPosition called via cleanNativeSteps for all steps including data_input inside subworkflows.
