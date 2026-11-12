---
"@galaxy-tool-util/schema": patch
---

Range-check frame `contains_steps` / `contains_comments` indices. Integer and all-digit entries past the end of the steps (inputs first) or comments are `FrameReferenceNotFound` lint errors, and `toNative` fails with the same message instead of writing dangling `child_steps` / `child_comments`. A step label still wins over an index.
