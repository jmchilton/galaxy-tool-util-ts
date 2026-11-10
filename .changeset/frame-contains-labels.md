---
"@galaxy-tool-util/schema": patch
"@galaxy-tool-util/cli": patch
---

Check frame `contains_steps` / `contains_comments` labels. `gxwf lint` reports an entry that names no step, input or comment as a `FrameReferenceNotFound` error and warns on an empty frame (`FrameIsEmpty`). `toNative` and `gxwf convert` fail with the same message instead of writing `child_steps: [null]`.
