---
"@galaxy-tool-util/search": patch
---

fix(search): stop `iterateToolSearchPages` re-fetching a duplicate page forever

The public Tool Shed's `/api/tools?q=` endpoint can ignore the `page`
parameter for a query and re-serve page 1 on every subsequent page request,
while still reporting the correct `total_results`. `iterateToolSearchPages`
only stopped once a page came back shorter than `pageSize`, so a
full-length-but-repeated page never satisfied that condition — the generator
kept re-fetching the identical page, bounded only by a caller's own
`maxResults` cutoff (3 redundant Tool Shed requests for `gxwf tool-search
cutadapt` at the CLI's default `pageSize`/`maxResults`, confirmed live
against `https://toolshed.g2.bx.psu.edu`).

`ToolSearchService.searchTools`'s existing `(repoOwnerUsername, repoName,
toolId)` dedup step already hid the resulting duplicate raw hits from CLI
output, so this was a wasted-network-request bug rather than a
duplicated-results bug on the current CLI — but it's worth closing directly:
`iterateToolSearchPages` now also stops once the cumulative hit count
reaches the server-reported `total_results`, so a misbehaving Tool Shed can
no longer cause repeated redundant fetches of the same page.
