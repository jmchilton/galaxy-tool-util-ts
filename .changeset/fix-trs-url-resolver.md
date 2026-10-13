---
"@galaxy-tool-util/schema": patch
"@galaxy-tool-util/cli": patch
---

Fix subworkflow expansion for GA4GH TRS-linked steps (`content_source: trs_url`,
as emitted by Galaxy ≥ 26.1 and planemo). The default URL resolver now fetches
the percent-encoded `/versions/<v>/GALAXY/descriptor` endpoint instead of the raw
`#workflow/...` URL (whose `#` was sent as a fragment), and reports a clear error
when the descriptor has no `content`. Adds `trsDescriptorUrl()` to
`@galaxy-tool-util/schema`, a port of gxformat2's `trs_descriptor_url()`.
