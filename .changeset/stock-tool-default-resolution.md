---
"@galaxy-tool-util/core": patch
---

fix(cache): resolve a concrete version for unversioned stock tools while keying under `_default_`

`getToolInfo` treated the `_default_` sentinel as a literal version: an unversioned
stock-tool request (`add Filter1`) fetched `…/versions/_default_` (404) and never
attempted version discovery, because a non-null `_default_` short-circuited
`resolveLatestVersion`.

`getToolInfo` now treats `_default_` as a cache-**key** placeholder, not a fetch version.
On a cache miss it resolves a concrete version (e.g. `Filter1` → `1.1.1`) for the network
request and records it as the entry's display version (so `list` surfaces it), while
keeping the entry **keyed** under `_default_` so the offline json-schema validate path
still gets cache hits. Genuinely versionless built-ins (`__APPLY_RULES__`) fall back to the
`_default_` sentinel for the fetch when the shed lists no versions. The cache lookup happens
before any discovery, so `_default_` cache hits stay network-free. `refetch` no longer
reports a non-existent `~<version>` key for stock tools.
