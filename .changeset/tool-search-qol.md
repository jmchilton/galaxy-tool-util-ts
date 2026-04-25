---
"@galaxy-tool-util/cli": minor
"@galaxy-tool-util/search": minor
---

Tool Shed discovery quality-of-life improvements.

`gxwf tool-search` gains client-side `--owner <user>` and `--match-name`
filters (the Tool Shed has no server-side `owner:` keyword on
`/api/tools`), plus a `--page <n>` flag to start paging beyond page 1.

`gxwf tool-search --enrich` resolves each hit's `ParsedTool` via the
shared tool-info cache and inlines it as `parsedTool` on each JSON hit,
so skills that pick the top 1–3 results can skip the follow-up
`galaxy-tool-cache add` round trip. Off by default; one fetch per hit.

New `gxwf repo-search <query>` command queries `/api/repositories?q=`
with server-side `owner:` / `category:` reserved keywords. Repository
search ranks by popularity (`times_downloaded`) and is better suited
for "find me a package about X" queries; tool-search remains the
right tool for exact tool-name lookups.

Exports `searchRepositories`, `iterateRepoSearchPages`, and
`buildRepoQuery` from `@galaxy-tool-util/search` for non-CLI consumers,
along with the `RepositorySearchHit` wire type and
`normalizeRepoSearchResults` validator.
