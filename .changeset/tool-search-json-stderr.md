---
"@galaxy-tool-util/core": patch
"@galaxy-tool-util/search": patch
"@galaxy-tool-util/cli": patch
---

Keep `gxwf tool-search --enrich --json` stdout machine-readable when enrichment fails. Universal core and search services now expose optional diagnostic sinks and remain silent by default, while the Node factories send diagnostics to stderr so CLI commands and servers retain failure details. Cache-write failures no longer discard a valid fetched tool, and only documented later-page `ObjectNotFound` responses are treated as empty search pages.
