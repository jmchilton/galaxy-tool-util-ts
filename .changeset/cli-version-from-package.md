---
"@galaxy-tool-util/cli": patch
---

`gxwf --version` and `galaxy-tool-cache --version` report the installed package version instead of a hard-coded `1.0.0`. The stale `version` field is dropped from `spec/*.json`; the `meta` exports carry the package version.
