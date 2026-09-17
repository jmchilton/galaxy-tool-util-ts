---
"@galaxy-tool-util/core": minor
"@galaxy-tool-util/gxwf-web": patch
"@galaxy-tool-util/tool-cache-proxy": patch
---

Share Node HTTP adapter helpers via `@galaxy-tool-util/core/node`.

`writeJson`, `setCorsHeaders`, `readJsonBody`, and `serveStatic` (with optional `csp` and `mimeTypes` overrides) now live in core. Both `gxwf-web` and `tool-cache-proxy` import them — local copies removed. Side effect: the proxy server can now opt in to a Content-Security-Policy header for static UI responses via `createProxyContext(config, { uiCsp })` (parity with `gxwf-web`'s Monaco-friendly CSP path), which unblocks shipping a Monaco-hosted UI from the proxy.
