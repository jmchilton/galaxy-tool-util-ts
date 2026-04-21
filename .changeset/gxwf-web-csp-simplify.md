---
"@galaxy-tool-util/gxwf-web": patch
---

CSP: drop `https://open-vsx.org`, `blob:`, and `data:` from `connect-src`. The Monaco extension is now served as an unpacked directory under `/ext/galaxy-workflows/` via plain HTTP; the browser no longer fetches Open VSX or constructs blob/data URLs for extension files. Production deployments are expected to unpack the extension server-side at startup into the same layout.
