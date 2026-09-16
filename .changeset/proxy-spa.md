---
"@galaxy-tool-util/tool-cache-proxy-ui": minor
"@galaxy-tool-util/tool-cache-proxy": minor
"@galaxy-tool-util/cache-ui": patch
---

Ship the tool-cache-proxy SPA (Phase 5 of merged cache UI plan).

- New private `@galaxy-tool-util/tool-cache-proxy-ui` package: minimal Vite + Vue 3 SPA wrapping `@galaxy-tool-util/cache-ui`'s `<ToolCacheView>`. Mounts at `/`, no nav shell.
- `tool-cache-proxy` serves the bundled SPA as a static-file fallback for non-API GETs when `uiDir` is set on the `ProxyContext`. The bin auto-discovers `../public` (populated by `pnpm copy-ui`) and respects a `GALAXY_TOOL_PROXY_UI_DIST` env override.
- New `cache-ui/cache-ui.css` ships sane defaults for the `--gx-*` design tokens the components reference; consumers that already define them (e.g. `gxwf-ui`) can skip the import.
- Root `pnpm build` now copies the SPA dist into `tool-cache-proxy/public/` after the workspace build.
