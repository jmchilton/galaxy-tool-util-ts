---
"@galaxy-tool-util/gxwf-web": minor
---

Emit Monaco-compatible `Content-Security-Policy` header on static responses (Phase 4.5 of VS Code integration plan). Adds `--csp-connect-src <origin>` CLI flag (repeatable) and `extraConnectSrc` option on `createApp` to extend `connect-src` with per-deployment tool-cache proxies or ToolShed mirrors.
