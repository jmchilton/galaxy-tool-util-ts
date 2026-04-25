# Pinned galaxy-workflows-vscode Commit

This file is the single source of truth for which `galaxy-workflows-vscode`
revision gxwf-ui is built and tested against. Bumps are deliberate,
reviewed PRs — update this file in the same commit that bumps any
artifact derived from it (`.vsix` fixture, `EXTENSION_COMMIT` in CI, etc.).

```
EXTENSION_REPO=https://github.com/davelopez/galaxy-workflows-vscode
EXTENSION_BRANCH=wf_tool_state
EXTENSION_COMMIT=f04ac4298345478a2dfedb091a963447cdcec951
```

## When to bump

- Upstream lands a fix / feature the plan depends on (LSP behavior, packaging,
  tool-cache wiring).
- Security / dependency update in the extension's tree.

## How to bump

1. Check out the new commit in a local clone of `galaxy-workflows-vscode`.
2. Rebuild the extension (`pnpm build:web` or equivalent) and exercise
   `pnpm dev:with-ext` against it locally.
3. If CI consumes a `.vsix` fixture, regenerate and check it in
   (`packages/gxwf-e2e/fixtures/galaxy-workflows.vsix` once Phase 1 tests
   land — see `VS_CODE_MONACO_FIRST_PLAN_V2.md`).
4. Update `EXTENSION_COMMIT` above.
5. Commit with a message that calls out the upstream change driving the bump.

## Consumers

- Contributor `pnpm dev:with-ext` flow (via `GXWF_EXT_PATH` env var pointing
  at a checkout at this commit).
- `VITE_GXWF_EXT_SOURCE=folder:...` dev runs.
- `vsix:` fixture builds in CI (Phase 9A).
- Server-side extension unpack at production startup (deferred; downloads
  from Open VSX into the `/ext/galaxy-workflows/` layout).
