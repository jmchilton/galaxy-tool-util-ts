---
"@galaxy-tool-util/schema": patch
---

Unify walker: state-merge.ts inject/strip now delegate to walkNativeState, eliminating ~140 lines of duplicated parameter-tree traversal. Extract walk-helpers.ts for shared helper functions. No behavioral changes.
