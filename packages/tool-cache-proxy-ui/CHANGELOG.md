# @galaxy-tool-util/tool-cache-proxy-ui

## 0.2.2

### Patch Changes

- Updated dependencies []:
  - @galaxy-tool-util/cache-ui@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @galaxy-tool-util/cache-ui@0.2.1

## 0.2.0

### Minor Changes

- [#176](https://github.com/jmchilton/galaxy-tool-util-ts/pull/176) [`cf74f73`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/cf74f73838d9c412d03d4638cbb14509c1cea6bc) Thanks [@jmchilton](https://github.com/jmchilton)! - Ship the tool-cache-proxy SPA (Phase 5 of merged cache UI plan).
  - New private `@galaxy-tool-util/tool-cache-proxy-ui` package: minimal Vite + Vue 3 SPA wrapping `@galaxy-tool-util/cache-ui`'s `<ToolCacheView>`. Mounts at `/`, no nav shell.
  - `tool-cache-proxy` serves the bundled SPA as a static-file fallback for non-API GETs when `uiDir` is set on the `ProxyContext`. The bin auto-discovers `../public` (populated by `pnpm copy-ui`) and respects a `GALAXY_TOOL_PROXY_UI_DIST` env override.
  - New `cache-ui/cache-ui.css` ships sane defaults for the `--gx-*` design tokens the components reference; consumers that already define them (e.g. `gxwf-ui`) can skip the import.
  - Root `pnpm build` now copies the SPA dist into `tool-cache-proxy/public/` after the workspace build.

### Patch Changes

- Updated dependencies [[`54f0d61`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54f0d61642a768d531027f9a174322b8259a9db8), [`cf74f73`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/cf74f73838d9c412d03d4638cbb14509c1cea6bc), [`d2e8574`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d2e8574c1bc615dbeea28e01c3a1a644b3638694)]:
  - @galaxy-tool-util/cache-ui@0.2.0
