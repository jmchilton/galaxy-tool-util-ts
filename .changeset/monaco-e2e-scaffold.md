---
"@galaxy-tool-util/gxwf-web": patch
"@galaxy-tool-util/gxwf-ui": patch
---

Unblock Monaco editor boot against the vsix fixture:

- `gxwf-web`: add a Monaco-specific CSP header for `/monaco/*` (extension host iframe + workers need `unsafe-inline`/`unsafe-eval`); add `blob:`/`data:` to the main CSP's `connect-src` so the vsix loader can fetch packaged extension files.
- `gxwf-ui`: switch the in-memory file provider from `registerCustomProvider` (pre-init only in monaco-vscode-api 30.x) to `registerFileSystemOverlay`, fixing the "Services are already initialized" crash on editor mount; patch the staged extension-host iframe's meta CSP to allow `blob:` fetches; honor the `:path` route param in `FileView` so deep links land on the selected file.
