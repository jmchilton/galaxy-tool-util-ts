---
"@galaxy-tool-util/schema": patch
---

Re-sync vendored `tests.schema.json` from Galaxy `wf_tool_state` branch.

Picks up upstream enrichment of `galaxy.tool_util_models.Tests`: new `Job`
def, named `assertion_list` ref replacing the auto-generated discriminator
blob, and added `title` fields on collection/file properties.
