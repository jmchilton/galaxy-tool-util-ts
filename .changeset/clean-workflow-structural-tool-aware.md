---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": patch
---

Extend `cleanWorkflow()` with structural cleaning and tool-aware stale key removal.

- `cleanWorkflow()` now strips Galaxy-injected `uuid` and `errors` from both native and format2 workflow/step dicts (not `position`, which is a legitimate workflow property)
- Format2 workflows now return per-step `CleanStepResult[]` instead of an empty array
- New optional `toolInputsResolver` option: when provided, drops keys not in the tool's parameter tree via `stripStaleKeysToolAware` (native) or `walkFormat2State` (format2) — steps whose tool is not found in the resolver are skipped gracefully
- `cleanWorkflow()` signature is now `async` (returns `Promise<CleanWorkflowResult>`) — **breaking change** for callers that used the result synchronously
- New export: `CleanWorkflowOptions`
