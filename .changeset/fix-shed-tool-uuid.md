---
"@galaxy-tool-util/schema": patch
---

fix(toNative): stop emitting the workflow step uuid as `tool_uuid` on shed tool steps

`toNative` was assigning each shed tool step's workflow `uuid` to `tool_uuid`.
`tool_uuid` is a reference to a dynamic / inline-defined (user) tool, not a
workflow-step identifier, so Galaxy's importer tried to resolve a tool by that
uuid and aborted the whole import with `ObjectNotFound`. Every multi-shed-tool
workflow produced by `gxwf convert --to native` was un-importable.

`tool_uuid` is now omitted entirely for shed tools, and on the user-defined
branch carries the tool representation's `uuid` (or `null` when none is
provided). The step `uuid` is still emitted unchanged. Fixes #147.
